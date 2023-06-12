const Seneca = require('seneca')
const once = require('lodash.once')

import EntityTransaction from '..'


describe('entity-transaction', () => {
  afterEach(() => {
    // NOTE: this cleans up spies created with jest.spyOn
    //
    jest.restoreAllMocks()
  })


  describe('single transaction', () => {
    let trx_handle

    function MyTrxPlugin() {
	const trx_strategy = {
	  async startTrx(_seneca) {
	    trx_handle = {
	      name: "pretend I'm a T-Rex",
	      async commit() {},
	      async rollback() {}
	    }

	    return trx_handle
	  },

	  async commitTrx(_seneca, trx) {
	    await trx.ctx.commit()
	  },

	  async rollbackTrx(_seneca, trx) {
	    await trx.ctx.rollback()
	  }
	}

	this.export('entity-transaction/integration').registerStrategy(trx_strategy)
    }


    test('basic usage', (fin_) => {
      const fin = once(fin_)


      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.ready(function () {
	this.transaction().start()
	  .then(senecatx => senecatx.transaction().commit())
	  .then(() => fin())
	  .catch(fin)
      })
    })
  })


  describe('starting multiple transactions on the same Seneca instance', () => {
    let trx_handles
    let num_trxs

    beforeEach(() => {
      trx_handles = []
      num_trxs = 0
    })


    function makeExampleTrxHandle(name) {
      return {
	name,
	async commit() {},
	async rollback() {}
      }
    }


    function MyTrxPlugin() {
	const trx_strategy = {
	  async startTrx(_seneca) {
	    if (num_trxs === 0) {
	      const trx_handle = makeExampleTrxHandle("pretend I'm a T-Rex")
	      trx_handles.push(trx_handle)

	      return trx_handle
	    }


	    if (num_trxs === 1) {
	      const trx_handle = makeExampleTrxHandle("pretend I'm a mango")
	      trx_handles.push(trx_handle)

	      return trx_handle
	    }


	    throw new Error(
	      'This test suite did not expect more than two concurrent trxs be tested'
	    )
	  },


	  async commitTrx(_seneca, trx) {
	    await trx.ctx.commit()
	  },


	  async rollbackTrx(_seneca, trx) {
	    await trx.ctx.rollback()
	  }
	}

	this.export('entity-transaction/integration').registerStrategy(trx_strategy)
    }


    test('works ok', (fin_) => {
      const fin = once(fin_)


      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.add('hello:world', function (msg, reply) {
	reply()
      })


      seneca.ready(function () {
      	async function impl() {
	  let num_calls = 0

	  const senecatrx1 = await this.transaction().start()
	  const senecatrx2 = await this.transaction().start()

	  senecatrx1.act('hello:world', next)
	  senecatrx2.act('hello:world', next)

	  function next(err) {
	    ++num_calls

	    if (err) {
	      return fin(err)
	    }

	    if (num_calls === 2) {
	      return fin()
	    }
	  }
	}


      	impl.call(this)
	  .then(() => fin())
	  .catch(fin)
      })
    })
  })


  describe('this-ref inside the strategy instance', () => {
    class UserStrategy {
      constructor() {
      	this.num_started = 0
      	this.num_committed = 0
      	this.num_rolledback = 0
      }

      startTrx() {
      	this.num_started++
      	return 'Pretend I am a T-Rex!'
      }

      commitTrx(trx) {
      	this.num_committed++
      }

      rollbackTrx(trx) {
      	this.num_rolledback++
      }
    }

    const trx_strategy = new UserStrategy()


    let trx_handle

    function MyTrxPlugin() {
	this.export('entity-transaction/integration').registerStrategy(trx_strategy)
    }


    test("it's easy for users to decorate their strategy instances with data and access that data", (fin_) => {
      const fin = once(fin_)


      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.ready(function () {
      	async function impl() {
	  const senecatx1 = await this.transaction().start()
	  const senecatx2 = await this.transaction().start()
	  const senecatx3 = await this.delegate().transaction().start()

	  await senecatx1.transaction().commit()
	  await senecatx2.transaction().rollback()
	  await senecatx3.transaction().commit()

	  expect(trx_strategy.num_started).toEqual(3)
	  expect(trx_strategy.num_committed).toEqual(2)
	  expect(trx_strategy.num_rolledback).toEqual(1)
	}

	impl.call(this)
	  .then(() => fin())
	  .catch(fin)
      })
    })
  })
})

