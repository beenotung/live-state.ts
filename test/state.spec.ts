import { expect } from 'chai'
import sinon from 'sinon'
import { LiveState, LifeCycle, PassiveState } from '../src/state'

describe('state.ts', () => {
  context('LiveState', () => {
    it('should get and set values', () => {
      let state = LiveState.of('v1')
      expect(state.peek()).to.equals('v1')
      state.update('v2')
      expect(state.peek()).to.equals('v2')
    })

    it('should invoke setup lifecycle', () => {
      let state = LiveState.of('v1')
      let setup = sinon.fake()
      state.attach({
        setup,
      })
      expect(setup.getCalls().length).to.equals(1)
    })

    it('should invoke teardown lifecycle', () => {
      let state = LiveState.of('v1')
      let teardown = sinon.fake()
      state.attach({
        teardown,
      })
      expect(teardown.getCalls().length).to.equals(0)
      state.teardown()
      expect(teardown.getCalls().length).to.equals(1)
    })

    it('should not throw error when attached empty lifecycle', () => {
      let state = LiveState.of(1)
      state.attach({})
      state.teardown()
    })

    context('pushing live update', () => {
      let state: LiveState<string>
      let update: sinon.SinonSpy
      let remove: () => void
      before(() => {
        state = LiveState.of('v1')
        update = sinon.fake()
      })
      after(() => {
        state.teardown()
      })
      it('return remover function when attach lifecycle', () => {
        remove = state.attach({ update })
        expect(remove).to.be.a('function')
      })
      it('should push live update when attached lifecycle', () => {
        expect(update.getCalls().length).to.equals(0)
        state.update('v2')
        expect(update.getCalls().length).to.equals(1)
        expect(update.getCalls()[0].args).to.deep.equals(['v2', 'v1'])
      })
      it('should not push update when the new value is the same as old value', () => {
        state.update('v2')
        expect(update.getCalls().length).to.equals(1)
      })
      it('should update when value is changed multiple times', () => {
        state.update('v3')
        expect(update.getCalls().length).to.equals(2)
        expect(update.getCalls()[1].args).to.deep.equals(['v3', 'v2'])
      })
      it('remove lifecycle', () => {
        remove()
      })
      it('should not push live update after remove lifecycle', () => {
        state.update('v3')
        expect(update.getCalls().length).to.equals(2)
      })
    })

    context('state.map', () => {
      context('push lifecycle down the chain', () => {
        let state1: LiveState<number>
        let state2: PassiveState<number>
        beforeEach(() => {
          state1 = LiveState.of(1)
          state2 = state1.map(x => x + 10)
        })
        afterEach(() => {
          state2.teardown()
          state1.teardown()
        })
        it('should trigger setup hook', () => {
          expect(state1.peek()).to.equals(1)
          expect(state2.peek()).to.equals(11)
        })
        it('should trigger update lifecycle', () => {
          state1.update(2)
          expect(state1.peek()).to.equals(2)
          expect(state2.peek()).to.equals(12)
        })
        it('should trigger teardown lifecycle', () => {
          let teardown = sinon.fake()
          state2.attach({ teardown })
          state1.teardown()

          expect(teardown.getCalls().length).to.equals(1)
        })
      })
      it('should throw error when directly update mapped state', () => {
        let state1 = LiveState.of(1)
        let state2 = state1.map(x => x + 10)

        let errorMock = mockConsoleError()
        expect(() => (state2 as LiveState<any>).update(2)).to.throw(
          'Cannot update passive state',
        )
        expect(errorMock.spy.getCalls().length).to.equals(1)
        errorMock.restore()

        state1.teardown()
      })
    })

    context('state.watch', () => {
      it('should watch for changes', () => {
        let state = LiveState.of('v1')
        let callback = sinon.fake()

        state.watch(callback)
        expect(callback.getCalls().length).to.equals(1)
        expect(callback.getCalls()[0].args).to.deep.equals(['v1'])

        state.update('v2')
        expect(callback.getCalls().length).to.equals(2)
        expect(callback.getCalls()[1].args).to.deep.equals(['v2'])
      })
      it('should not receive callback after detach watcher', () => {
        let state = LiveState.of('v1')
        let callback = sinon.fake()

        let detach = state.watch(callback)
        expect(callback.getCalls().length).to.equals(1)

        detach()
        state.update('v2')
        expect(callback.getCalls().length).to.equals(1)
      })
      it('should auto remove watcher after teardown', () => {
        let state = LiveState.of('v1')
        let callback = sinon.fake()

        state.watch(callback)
        expect(callback.getCalls().length).to.equals(1)

        state.teardown()
        state.update('v2')
        expect(callback.getCalls().length).to.equals(1)
      })
      it('should be able to watch derived state update', () => {
        let state1 = LiveState.of('v1')
        let state2 = state1.map(value => [value, value])
        let callback = sinon.fake()

        state2.watch(callback)
        expect(callback.getCalls().length).to.equals(1)
        expect(callback.getCalls()[0].args).to.deep.equals([['v1', 'v1']])

        state1.update('v2')
        expect(callback.getCalls().length).to.equals(2)
        expect(callback.getCalls()[1].args).to.deep.equals([['v2', 'v2']])
      })
    })

    context('LiveState.combine', () => {
      let a: LiveState<string>
      let b: LiveState<string>
      let c: PassiveState<[string, string]>
      before(() => {
        a = LiveState.of('a')
        b = LiveState.of('b')
      })
      it('should combine state with initial value', () => {
        c = LiveState.combine(a, b, (a, b) => [a, b], '[a, b]')
        expect(c.peek()).to.deep.equals(['a', 'b'])
      })
      it('should push update from upstream', () => {
        a.update('aa')
        expect(c.peek()).to.deep.equals(['aa', 'b'])
        b.update('bb')
        expect(c.peek()).to.deep.equals(['aa', 'bb'])
      })
      it('should not re-compute when upstream value is not changed', () => {
        let value = c.peek()
        a.update('aa')
        b.update('bb')
        expect(c.peek()).to.equals(value)
      })
      it('should not allow update combined value from external', () => {
        let errorMock = mockConsoleError()
        expect(() => (c as LiveState<any>).update('c')).to.throw(
          'Cannot update passive state',
        )
        expect(errorMock.spy.getCalls().length).to.equals(1)
        errorMock.restore()
      })
      context('teardown source state of combined state', () => {
        let teardown: sinon.SinonSpy
        beforeEach(() => {
          a = LiveState.of('a')
          b = LiveState.of('a')
          c = LiveState.combine(a, b, (a, b) => [a, b], '[a, b]')
          teardown = sinon.fake()
          c.attach({ teardown })
        })
        it('when first source state is teardown', () => {
          a.teardown()
          expect(teardown.getCalls().length).to.equals(1)
        })
        it('when second source state is teardown', () => {
          b.teardown()
          expect(teardown.getCalls().length).to.equals(1)
        })
        it('when both source states are teardown', () => {
          a.teardown()
          b.teardown()
          expect(teardown.getCalls().length).to.equals(1)
        })
      })
    })
  })
})

function mockConsoleError() {
  let originalError = console.error
  let spy = sinon.fake()
  console.error = spy

  let restore = () => (console.error = originalError)
  return { spy, restore }
}
