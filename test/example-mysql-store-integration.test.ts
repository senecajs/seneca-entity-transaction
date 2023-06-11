import EntityTransaction from '..'
import MysqlTestDbConfig from './support/mysql/config.ts'
import MysqlHelpers from './support/mysql/helpers.ts'

const Seneca = require('seneca')
const SenecaEntity = require('seneca-entity')
const Mysql = require('mysql2/promise')
const once = require('lodash.once')


describe('example mysql store integration', () => {
  let db

  beforeAll(async () => {
    db = await Mysql.createConnection(MysqlTestDbConfig.connection)
  })

  afterAll(async () => {
    await db.destroy()
  })


  beforeEach(async () => {
    await db.execute('delete from seneca_users')
  })


  function MyPreciousStorePlugin(opts) {
    class MyPreciousStorePluginStrategy {
      constructor(db) {
      	this.db = db
      }

      async startTrx(_seneca) {
	await this.db.query('START TRANSACTION')
	return null
      }

      async commitTrx(_seneca, trx) {
	await this.db.query('COMMIT')
      }

      async rollbackTrx(_seneca, trx) {
	await this.db.query('ROLLBACK')
      }
    }

    function tableName(ent) {
      const canon = ent.canon$({ object: true })
      return canon.name
    }

    function tryRetrieveTrxInfo(seneca) {
      return seneca.fixedmeta?.custom?.entity_transaction?.trx
    }

    const seneca = this
    const db = opts.getConnection()

    const store = {
      name: 'MyPrecious',

      save(msg, reply) {
	const tablename = tableName(msg.ent)
	
	if (tablename !== 'seneca_users') {
	  return reply(new Error('The example store only supports the seneca_users entity'))
	}

	MysqlHelpers.saveRecord(db, tablename, seneca.util.clean(msg.ent))
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
      registerTrxStrategy(new MyPreciousStorePluginStrategy(db))
    }
  }


  test('store plugins may integrate entity transactions (test of commit)', (fin_) => {
    const fin = once(fin_)

    const seneca = Seneca().test(fin)
    seneca.use(SenecaEntity)
    seneca.use(EntityTransaction)

    seneca.use(MyPreciousStorePlugin, {
      getConnection() {
	return db
      }
    })

    seneca.ready(function () {
      async function impl() {
	expect(await MysqlHelpers.countRecords(db, 'seneca_users')).toEqual(0)
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
	expect(await MysqlHelpers.countRecords(db, 'seneca_users')).toEqual(2)
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

    seneca.use(MyPreciousStorePlugin, {
      getConnection() {
	return db
      }
    })


    seneca.add('hello:world', function (msg, reply) {
      async function impl() {
	expect(await MysqlHelpers.countRecords(db, 'seneca_users')).toEqual(0)


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

	expect(await MysqlHelpers.countRecords(db, 'seneca_users')).toEqual(0)
      }

      impl.call(this)
	.then(() => reply())
	.catch(reply)
    })

    seneca.ready(function () {
      this.act('hello:world', fin)
    })
  })


  // TODO
  test('nested trxs, start-start-commit-rollback', (fin) => {
    fin()
  })


  test('parallel trxs are handled correctly', (fin_) => {
    const fin = once(fin_)

    const seneca = Seneca().test(fin)
    seneca.use(SenecaEntity)
    seneca.use(EntityTransaction)

    seneca.use(MyPreciousStorePlugin, {
      getConnection() {
	return db
      }
    })


    seneca.add('hello:world', function (msg, reply) {
      async function impl() {
	expect(await MysqlHelpers.countRecords(db, 'seneca_users')).toEqual(0)


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

	expect(await MysqlHelpers.countRecords(db, 'seneca_users')).toEqual(1)
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
