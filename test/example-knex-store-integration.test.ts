import Knex from 'knex'
import EntityTransaction from '..'
import MysqlTestDbConfig from './support/mysql/config.ts'

const Seneca = require('seneca')
const SenecaEntity = require('seneca-entity')
const once = require('lodash.once')


describe('example knex store integration', () => {
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

  describe('example store with integration', () => {
    function MyKnexStorePlugin(opts) {
      function defaultTrxStrategy(knex) {
	const trx_strategy = {
	  async startTrx(seneca) {
	    let trx


	    const pending_trx_info = tryRetrieveTrxInfo(seneca)

	    if (pending_trx_info) {
	      trx = await pending_trx_info.ctx.transaction()
	    } else {
	      trx = await knex.transaction()
	    }

	    knex_trx = trx

	    return trx
	  },

	  async commitTrx(_seneca, trx) {
	    await trx.ctx.commit()
	  },

	  async rollbackTrx(_seneca, trx) {
	    await trx.ctx.rollback()
	  }
	}

	return trx_strategy
      }

      function tableName(ent) {
	const canon = ent.canon$({ object: true })
	return canon.name
      }

      function tryRetrieveTrxInfo(seneca) {
	return seneca.fixedmeta?.custom?.entity_transaction?.trx
      }

      function dbClient(seneca, knex) {
	return tryRetrieveTrxInfo(seneca)?.ctx ?? knex
      }


      const seneca = this
      const knex = opts.getKnex()

      const store = {
	name: 'MyKnexStore',

	save(msg, reply) {
	  const tablename = tableName(msg.ent)
	  
	  if (tablename !== 'seneca_users') {
	    return reply(new Error('The example store only supports the seneca_users entity'))
	  }


	  const db_client = dbClient(this, knex)

	  db_client(tablename).insert(seneca.util.clean(msg.ent))
	    .then(() => reply())
	    .catch(reply)
	},

	load(msg, reply) {
	  reply(new Error('not implemented'))
	},

	list(msg, reply) {
	  reply(new Error('not implemented'))
	},

	remove(msg, reply) {
	  reply(new Error('not implemented'))
	},

	native(reply) {
	  reply(new Error('not implemented'))
	},

	close(reply) {
	  reply(new Error('not implemented'))
	}
      }

      this.store.init(this, opts, store)

      const registerTrxStrategy = this.export('entity-transaction/registerStrategy')
      const isTrxPluginUsed = null != registerTrxStrategy

      if (isTrxPluginUsed) {
	registerTrxStrategy(defaultTrxStrategy(knex))
      }
    }


    test('store plugins may integrate entity transactions (test of rollback)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyKnexStorePlugin, {
	getKnex() {
	  return knex
	}
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

      seneca.use(MyKnexStorePlugin, {
	getKnex() {
	  return knex
	}
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

      seneca.use(MyKnexStorePlugin, {
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


    test('nested trxs, start-start-rollback-rollback', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyKnexStorePlugin, {
	getKnex() {
	  return knex
	}
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

      seneca.use(MyKnexStorePlugin, {
	getKnex() {
	  return knex
	}
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


    test('parallel trxs are handled correctly', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyKnexStorePlugin, {
	getKnex() {
	  return knex
	}
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

      seneca.use(MyKnexStorePlugin, {
	getKnex() {
	  return knex
	}
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

      seneca.use(MyKnexStorePlugin, {
	getKnex() {
	  return knex
	}
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
  })

  describe('example store without integration', () => {
    function MyKnexStorePlugin(opts) {
      function tableName(ent) {
	const canon = ent.canon$({ object: true })
	return canon.name
      }

      const seneca = this
      const knex = opts.getKnex()

      const store = {
	name: 'MyPrecious',

	save(msg, reply) {
	  const tablename = tableName(msg.ent)
	  
	  if (tablename !== 'seneca_users') {
	    return reply(new Error('The example store only supports the seneca_users entity'))
	  }


	  knex(tablename).insert(seneca.util.clean(msg.ent))
	    .then(() => reply())
	    .catch(reply)
	},

	load(msg, reply) {
	  reply(new Error('not implemented'))
	},

	list(msg, reply) {
	  reply(new Error('not implemented'))
	},

	remove(msg, reply) {
	  reply(new Error('not implemented'))
	},

	native(reply) {
	  reply(new Error('not implemented'))
	},

	close(reply) {
	  reply(new Error('not implemented'))
	}
      }

      this.store.init(this, opts, store)
    }


    test('stores work as usual if the entity-transaction plugin is used but not integrated', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(SenecaEntity)
      seneca.use(EntityTransaction)

      seneca.use(MyKnexStorePlugin, {
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
  await new Promise((resolve, reject) => {
    seneca.make$('seneca_users')
      .data$(data)
      .save$((err) => {
	if (err) return reject(err)
	resolve()
      })
  })
}


async function countRecords(knex) {
  const c = await knex.count('id', { as: 'count' }).first()
  return Number(c.count)
}
