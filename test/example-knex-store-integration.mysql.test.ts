import { EventEmitter } from 'node:events'
import Knex from 'knex'
import EntityTransaction from '..'
import MysqlTestDbConfig from './support/mysql/config.ts'
import StoreBase from './support/StoreBase.ts'

const Seneca = require('seneca')
const SenecaEntity = require('seneca-entity')
const once = require('lodash.once')


describe('example mysql knex store integration', () => {
  let knex

  beforeAll(() => {
    knex = Knex(MysqlTestDbConfig)
  })

  afterAll((fin) => {
    knex.destroy(fin)
  })


  beforeEach(async () => {
    await knex('seneca_users').delete()
  })


  class MyExampleKnexMysqlStore extends StoreBase {
    constructor(name, opts) {
      super(name)

      this.knex = opts.getKnex()
      this.interceptStoreError = opts.interceptStoreError ?? ((err, reply) => reply(err))
      this.trx_integration_api = null
    }

    _dbClient(seneca) {
      if (this.trx_integration_api) {
	const maybe_pending_trxctx = this.trx_integration_api.getContext(seneca)

	if (maybe_pending_trxctx && maybe_pending_trxctx.value) {
	  return maybe_pending_trxctx.value.knex
	}
      }

      return this.knex
    }

    save(seneca, msg, reply) {
      const tablename = tableNameOfEntity(msg.ent)
      
      if (tablename !== 'seneca_users') {
	return reply(new Error('The example store only supports the seneca_users entity'))
      }


      const db_client = this._dbClient(seneca, this.knex)

      db_client(tablename).insert(seneca.util.clean(msg.ent))
	.then(([id]) => reply(null, { id }))
	.catch(err => this.interceptStoreError(err, reply))
    }

    enableTransactions(trx_integration_api, trx_strategy) {
      this.trx_integration_api = trx_integration_api
      trx_integration_api.registerStrategy(trx_strategy)
    }
  }

  function trxIntegrationApi(seneca) {
    return seneca.export('entity-transaction/integration') ?? null
  }


  describe('example knex store with integration', () => {
    function MyExampleKnexStorePlugin(opts) {
      const seneca = this
      const my_store = new MyExampleKnexMysqlStore('MyKnexStore', opts)


      const trx_integration_api = trxIntegrationApi(seneca) ?? null

      if (trx_integration_api) {
      	const trx_strategy = opts.getTrxStrategy(knex, trx_integration_api)
      	my_store.enableTransactions(trx_integration_api, trx_strategy)
      }


      seneca.store.init(seneca, opts, my_store.asSenecaStore())
    }

    // NOTE: Trx strategies are supposed to be implemented by store plugins. For example,
    // in this scenario - it's the example store plugin.
    //
    function makeSimpleTrxStrategy(knex, trx_integration_api) {
      const trx_strategy = {
	async startTrx(seneca) {
	  const maybe_pending_trxctx = trx_integration_api.getContext(seneca)

	  if (maybe_pending_trxctx) {
	    const { value: trxctx } = maybe_pending_trxctx
	    return { knex: await trxctx.knex.transaction() }
	  }

	  return { knex: await knex.transaction() }
	},

	async commitTrx(seneca) {
	  const { value: ctx } = trx_integration_api.getContext(seneca)
	  await ctx.knex.commit()
	},

	async rollbackTrx(seneca) {
	  const { value: ctx } = trx_integration_api.getContext(seneca)
	  await ctx.knex.rollback()
	}
      }

      return trx_strategy
    }


    test('store plugins may integrate entity transactions (test of rollback)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })

      seneca.ready(function () {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await saveUser(senecatrx, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await senecatrx.transaction().rollback()
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	}


	impl.call(this)
	  .then(() => fin())
	  .catch(fin)
      })
    })


    test('store plugins may integrate entity transactions (test of commit)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })

      seneca.ready(function () {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await saveUser(senecatrx, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await senecatrx.transaction().commit()
	  expect(await countRecords(knex('seneca_users'))).toEqual(2)
	}


	impl.call(this)
	  .then(() => fin())
	  .catch(fin)
      })
    })


    test('store plugins work as usual when the entity-transaction plugin is not used', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })

      seneca.ready(function () {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  await saveUser(this, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await saveUser(this, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  expect(await countRecords(knex('seneca_users'))).toEqual(2)
	}


	impl.call(this)
	  .then(() => fin())
	  .catch(fin)
      })
    })


    test('nested trxs, start-start-rollback-rollback', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)


	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })


	  const senecatrx_child = await senecatrx.transaction().start()

	  await saveUser(senecatrx_child, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })


	  await senecatrx_child.transaction().rollback()
	  await senecatrx.transaction().rollback()

	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('nested trxs, start-start-commit-rollback', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)


	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })


	  const senecatrx_child = await senecatrx.transaction().start()

	  await saveUser(senecatrx_child, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })


	  await senecatrx_child.transaction().commit()
	  await senecatrx.transaction().rollback()

	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('nested trxs with priors, start-start-commit-rollback', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  const senecatrx_child = await this.transaction().start()

	  await saveUser(senecatrx_child, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await senecatrx_child.transaction().commit()
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)


	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await new Promise((resolve, reject) => {
	    senecatrx.prior(msg, function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

	  await senecatrx.transaction().rollback()

	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	}


	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('nested trxs, start-start-rollback-commit', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)


	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  const senecatrx_child = await senecatrx.transaction().start()

	  await saveUser(senecatrx_child, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await senecatrx_child.transaction().rollback()
	  await senecatrx.transaction().commit()

	  expect(await countRecords(knex('seneca_users'))).toEqual(1)

	  const user = await knex('seneca_users').first()
	  expect(user.username).toEqual('alice123')
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('nested trxs with priors, start-start-rollback-commit', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('hello:world', function (msg, reply) {
      	async function impl() {
	  const senecatrx_child = await this.transaction().start()

	  await saveUser(senecatrx_child, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await senecatrx_child.transaction().rollback()
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)


	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await new Promise((resolve, reject) => {
	    senecatrx.prior(msg, function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

	  await senecatrx.transaction().commit()

	  expect(await countRecords(knex('seneca_users'))).toEqual(1)

	  const user = await knex('seneca_users').first()
	  expect(user.username).toEqual('alice123')
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('parallel trxs are handled correctly', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)


	  const senecatrx1 = await this.transaction().start()

	  await saveUser(senecatrx1, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })


	  const senecatrx2 = await this.transaction().start()

	  await saveUser(senecatrx2, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })


	  await senecatrx2.transaction().rollback()
	  await senecatrx1.transaction().commit()

	  expect(await countRecords(knex('seneca_users'))).toEqual(1)
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('nested trxs, start in a handler, start-commit in a subhandler, rollback in the handler', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('bonjour:monde', function (msg, reply) {
	async function impl() {
	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await senecatrx.transaction().commit()
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })


	  await new Promise((resolve, reject) => {
	    senecatrx.act('bonjour:monde', function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })


	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  await senecatrx.transaction().rollback()

	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	}


	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('nested trxs, start in a handler, start-rollback in a subhandler, commit in the handler', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('bonjour:monde', function (msg, reply) {
	async function impl() {
	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await senecatrx.transaction().rollback()
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })


	  await new Promise((resolve, reject) => {
	    senecatrx.act('bonjour:monde', function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })


	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  await senecatrx.transaction().commit()

	  expect(await countRecords(knex('seneca_users'))).toEqual(1)
	}


	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('nested trx, when parent trx is committed, the child trx is committed too', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  const senecatrx = await this.transaction().start()


	  const nestedtrx = await senecatrx.transaction().start()

	  await saveUser(nestedtrx, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })


	  await senecatrx.transaction().commit()


	  expect(await countRecords(knex('seneca_users'))).toEqual(1)
	}


	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('opening multiple nested trxs in series, on an existing trx instance', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })

      seneca.add('bonjour:monde', function (msg, reply) {
      	async function impl() {
	  let senecatrx

	  senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await senecatrx.transaction().commit()


	  senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await senecatrx.transaction().commit()
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.add('hello:world', function (msg, reply) {
      	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  const senecatrx = await this.transaction().start()

	  await new Promise((resolve, reject) => {
	    senecatrx.act('bonjour:monde', function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

	  await senecatrx.transaction().rollback()
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
      	this.act('hello:world', fin)
      })
    })


    test('the plugin by itself does not manage trx reuse', (fin_) => {
      const fin = once(fin_)
      let was_the_trx_error_thrown = false


      const seneca = Seneca().test(fin)

      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy,

	interceptStoreError(err, callback) {
	  if (err?.message?.includes('Transaction query already complete')) {
	    //
	    // NOTE: This error is coming from knex, not the plugin.

	    was_the_trx_error_thrown = true
	    callback()

	    return
	  }

	  callback(err)
	}
      })

      seneca.add('hello:world', function (msg, reply) {
      	async function impl() {
      	  let senecatrx

	  senecatrx = await this.transaction().start()
	  await senecatrx.transaction().commit()


	  senecatrx = await senecatrx.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  expect(was_the_trx_error_thrown).toEqual(true)
	  await senecatrx.transaction().commit()
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
      	this.act('hello:world', fin)
      })
    })


    test('trx is carried over via a prior stack (rollback test)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  await saveUser(this, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await new Promise((resolve, reject) => {
	    senecatrx.prior(msg, function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

	  await saveUser(senecatrx, {
	    username: 'charlie456',
	    email: 'charlie@example.com'
	  })

	  await senecatrx.transaction().rollback()
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
      	seneca.act('hello:world', fin)
      })
    })


    test('trx is carried over via a prior stack (commit test)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  await saveUser(this, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await new Promise((resolve, reject) => {
	    senecatrx.prior(msg, function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

	  await saveUser(senecatrx, {
	    username: 'charlie456',
	    email: 'charlie@example.com'
	  })

	  await senecatrx.transaction().commit()
	  expect(await countRecords(knex('seneca_users'))).toEqual(3)
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
      	seneca.act('hello:world', fin)
      })
    })


    test('trx is carried over to a subhandler (rollback test)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('bonjour:monde', function (msg, reply) {
	async function impl() {
	  await saveUser(this, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await new Promise((resolve, reject) => {
	    senecatrx.act('bonjour:monde', function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

	  await saveUser(senecatrx, {
	    username: 'charlie456',
	    email: 'charlie@example.com'
	  })

	  await senecatrx.transaction().rollback()
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
      	seneca.act('hello:world', fin)
      })
    })


    test('trx is carried over to a subhandler (commit test)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	},

	getTrxStrategy: makeSimpleTrxStrategy
      })


      seneca.add('bonjour:monde', function (msg, reply) {
	async function impl() {
	  await saveUser(this, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	  const senecatrx = await this.transaction().start()

	  await saveUser(senecatrx, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await new Promise((resolve, reject) => {
	    senecatrx.act('bonjour:monde', function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

	  await saveUser(senecatrx, {
	    username: 'charlie456',
	    email: 'charlie@example.com'
	  })

	  await senecatrx.transaction().commit()
	  expect(await countRecords(knex('seneca_users'))).toEqual(3)
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
      	seneca.act('hello:world', fin)
      })
    })

    describe('store strategy implementing post-commit hooks', () => {
      function makeTrxStrategyWithPostCommitHooksSupport(knex, trx_integration_api) {
      	/*
      const trx_strategy = {
	async startTrx(seneca) {
	  const maybe_pending_trxctx = trx_integration_api.getContext(seneca)

	  if (maybe_pending_trxctx) {
	    const { value: trxctx } = maybe_pending_trxctx
	    return { knex: await trxctx.knex.transaction() }
	  }

	  return { knex: await knex.transaction() }
	},

	async commitTrx(seneca) {
	  const { value: ctx } = trx_integration_api.getContext(seneca)
	  await ctx.knex.commit()
	},

	async rollbackTrx(seneca) {
	  const { value: ctx } = trx_integration_api.getContext(seneca)
	  await ctx.knex.rollback()
	}
      }
	*/

	const trx_strategy = {
	  async startTrx(seneca) {
	    const maybe_pending_trxctx = trx_integration_api.getContext(seneca)

	    if (maybe_pending_trxctx) {
	      const { value: pending_trxctx } = maybe_pending_trxctx

	      return {
	      	is_master: false,
	      	events: pending_trxctx.events,
		knex: await pending_trxctx.knex.transaction()
	      }
	    }

	    return {
	      is_master: true,
	      events: new EventEmitter(),
	      knex: await knex.transaction()
	    }
	  },

	  async commitTrx(seneca) {
	    const { value: trxctx } = trx_integration_api.getContext(seneca)
	    await trxctx.knex.commit()

	    if (trxctx.is_master) {
	      trxctx.events.emit('afterMasterCommit')
	    }
	  },

	  async rollbackTrx(seneca) {
	    const { value: trxctx } = trx_integration_api.getContext(seneca)
	    await trxctx.knex.rollback()

	    if (trxctx.is_master) {
	      trxctx.events.emit('afterMasterRollback')
	    }
	  }
	}

	return trx_strategy
      }

      test('post-commit hooks can be implemented in a way they will not get triggered if the master trx got rolled back', (fin_) => {
	const fin = once(fin_)

	const seneca = Seneca().test(fin)
	seneca.use(SenecaEntity)
	seneca.use(EntityTransaction)

	seneca.use(MyExampleKnexStorePlugin, {
	  getKnex() {
	    return knex
	  },

	  getTrxStrategy: makeTrxStrategyWithPostCommitHooksSupport
	})


	const notifyPersonalManager = jest.fn()
	const emailPremiumCustomer = jest.fn()


	seneca.add('cmd:createPersonalManager', function (msg, reply) {
	  async function impl() {
	    const senecatrx = await this.transaction().start()
	    const { value: trxctx } = senecatrx.transaction().getContext()

	    trxctx.events.once('afterMasterCommit', () => {
	      notifyPersonalManager()
	    })


	    await saveUser(senecatrx, {
	      username: 'bob456',
	      email: 'bob@example.com'
	    })


	    await senecatrx.transaction().commit()
	  }

	  impl.call(this)
	    .then(() => reply())
	    .catch(reply)
	})

	seneca.add('cmd:createPremiumCustomer', function (msg, reply) {
	  async function impl() {
	    const senecatrx = await this.transaction().start()
	    const { value: trxctx } = senecatrx.transaction().getContext()

	    trxctx.events.once('afterMasterCommit', () => {
	      emailPremiumCustomer()
	    })


	    await saveUser(senecatrx, {
	      username: 'alice123',
	      email: 'alice@example.com'
	    })

	    await new Promise((resolve, reject) => {
	      senecatrx.act('cmd:createPersonalManager', function (err) {
		if (err) return reject(err)
		resolve()
	      })
	    })


	    await senecatrx.transaction().rollback()
	  }

	  impl.call(this)
	    .then(() => reply())
	    .catch(reply)
	})

	seneca.ready(function () {
	  seneca.act('cmd:createPremiumCustomer', function (err) {
	    if (err) return fin(err)

	    expect(notifyPersonalManager.mock.calls.length).toEqual(0)
	    expect(emailPremiumCustomer.mock.calls.length).toEqual(0)

	    fin()
	  })
	})
      })

      test('post-commit hooks can be implemented in a way they get triggered upon commit of a master trx', (fin_) => {
	const fin = once(fin_)

	const seneca = Seneca().test(fin)
	seneca.use(SenecaEntity)
	seneca.use(EntityTransaction)

	seneca.use(MyExampleKnexStorePlugin, {
	  getKnex() {
	    return knex
	  },

	  getTrxStrategy: makeTrxStrategyWithPostCommitHooksSupport
	})


	const notifyPersonalManager = jest.fn()
	const emailPremiumCustomer = jest.fn()

	let user_alice
	let user_bob


	seneca.add('cmd:createPersonalManager', function (msg, reply) {
	  async function impl() {
	    const senecatrx = await this.transaction().start()

	    user_bob = await saveUser(senecatrx, {
	      username: 'bob456',
	      email: 'bob@example.com'
	    })


	    const { value: trxctx } = await senecatrx.transaction().getContext()

	    trxctx.events.once('afterMasterCommit', () => {
	      notifyPersonalManager(user_bob.id)
	    })


	    await senecatrx.transaction().commit()
	  }

	  impl.call(this)
	    .then(() => reply())
	    .catch(reply)
	})

	seneca.add('cmd:createPremiumCustomer', function (msg, reply) {
	  async function impl() {
	    const senecatrx = await this.transaction().start()

	    user_alice = await saveUser(senecatrx, {
	      username: 'alice123',
	      email: 'alice@example.com'
	    })


	    const { value: trxctx } = await senecatrx.transaction().getContext()

	    trxctx.events.once('afterMasterCommit', () => {
	      emailPremiumCustomer(user_alice.id)
	    })


	    await new Promise((resolve, reject) => {
	      senecatrx.act('cmd:createPersonalManager', function (err) {
		if (err) return reject(err)
		resolve()
	      })
	    })


	    await senecatrx.transaction().commit()
	  }

	  impl.call(this)
	    .then(() => reply())
	    .catch(reply)
	})

	seneca.ready(function () {
	  seneca.act('cmd:createPremiumCustomer', function (err) {
	    if (err) return fin(err)

	    expect(user_bob.id).toBeTruthy()
	    expect(notifyPersonalManager).toHaveBeenCalledWith(user_bob.id)

	    expect(user_alice.id).toBeTruthy()
	    expect(emailPremiumCustomer).toHaveBeenCalledWith(user_alice.id)

	    fin()
	  })
	})
      })
    })
  })

  describe('example knex store without integration', () => {
    function MyExampleKnexStorePlugin(opts) {
      const seneca = this
      const my_store = new MyExampleKnexMysqlStore('MyPrecious', opts)

      this.store.init(this, opts, my_store.asSenecaStore())
    }


    test('stores work as usual if the entity-transaction plugin is used but not integrated', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyExampleKnexStorePlugin, {
	getKnex() {
	  return knex
	}
      })

      seneca.ready(function () {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  await saveUser(this, {
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await saveUser(this, {
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  expect(await countRecords(knex('seneca_users'))).toEqual(2)
	}


	impl.call(this)
	  .then(() => fin())
	  .catch(fin)
      })
    })
  })
})

async function saveUser(seneca, data) {
  return new Promise((resolve, reject) => {
    seneca.make$('seneca_users')
      .data$(data)
      .save$((err, result) => {
	if (err) return reject(err)
	resolve(result)
      })
  })
}


async function countRecords(knex) {
  const c = await knex.count('id', { as: 'count' }).first()
  return Number(c.count)
}


function tableNameOfEntity(ent) {
  const canon = ent.canon$({ object: true })
  return canon.name
}
