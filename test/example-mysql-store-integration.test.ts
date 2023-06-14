import EntityTransaction from '..'
import MysqlTestDbConfig from './support/mysql/config.ts'
import MysqlHelpers from './support/mysql/helpers.ts'
import StoreBase from './support/StoreBase.ts'

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


  // NOTE: We want to be able to count the real number of rows in the database
  // at any point in time, and this is why we designate a separate connection
  // for this purpose.
  //
  // Otherwise, re-using the same connection that is used for transactions,
  // would yield row counts that depend on the transaction state.
  //
  let db_global

  beforeAll(async () => {
    db_global = await Mysql.createConnection(MysqlTestDbConfig.connection)
  })

  afterAll(async () => {
    await db_global.destroy()
  })


  beforeEach(async () => {
    await db_global.execute('delete from seneca_users')
  })


  class MyExampleMysqlStore extends StoreBase {
      constructor(name, opts) {
      	super(name)

      	this.db = opts.getConnection()
      }

      save(seneca, msg, reply) {
	const tablename = tableNameOfEntity(msg.ent)
	
	if (tablename !== 'seneca_users') {
	  return reply(new Error('The example store only supports the seneca_users entity'))
	}

	MysqlHelpers.saveRecord(this.db, tablename, seneca.util.clean(msg.ent))
	  .then(() => reply())
	  .catch(reply)
      }
  }

  function trxIntegrationApi(seneca) {
    return seneca.export('entity-transaction/integration') ?? null
  }

  class MyPreciousStorePluginStrategy {
    constructor(db) {
      this.db = db
    }

    async startTrx(_seneca, pending_trx = null) {
      if (pending_trx) {
	throw new Error('There is a pending trx already. Starting a new trx would cause an implicit commit.')
      }

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

  function MyPreciousStorePlugin(opts) {
    const seneca = this

    const store = new MyExampleMysqlStore('MyPrecious', opts).asSenecaStore()
    seneca.store.init(seneca, opts, store)

    if (trxIntegrationApi(seneca)) {
      const db = opts.getConnection()
      trxIntegrationApi(seneca).registerStrategy(new MyPreciousStorePluginStrategy(db))
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(0)
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(2)
      }


      impl.call(this)
	.then(() => fin())
	.catch(fin)
    })
  })


  test('store plugins may integrate entity transactions (test of rollback)', (fin_) => {
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(0)
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(0)
      }


      impl.call(this)
	.then(() => fin())
	.catch(fin)
    })
  })


  test('trx is carried over via a prior stack (rollback test)', (fin_) => {
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(0)
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(0)
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

    seneca.use(MyPreciousStorePlugin, {
      getConnection() {
	return db
      }
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(0)
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(3)
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

    seneca.use(MyPreciousStorePlugin, {
      getConnection() {
	return db
      }
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(0)
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(0)
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

    seneca.use(MyPreciousStorePlugin, {
      getConnection() {
	return db
      }
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(0)
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(3)
      }

      impl.call(this)
	.then(() => reply())
	.catch(reply)
    })

    seneca.ready(function () {
      seneca.act('hello:world', fin)
    })
  })


  test('nested trxs, start-start-commit-rollback, strategy can prevent implicit commits', (fin_) => {
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
	expect(await MysqlHelpers.countRecords(db_global, 'seneca_users')).toEqual(0)


	const senecatrx = await this.transaction().start()

	await saveUser(senecatrx, {
	  username: 'alice123',
	  email: 'alice@example.com'
	})


	try {
	  const _senecatrx_child = await senecatrx.transaction().start()
	} catch (err) {
	  if (err?.message === 'There is a pending trx already. Starting a new trx would cause an implicit commit.') {
	    return
	  }

	  throw err
	}

	throw new Error('Expected the code to throw an error')
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


function tableNameOfEntity(ent) {
  const canon = ent.canon$({ object: true })
  return canon.name
}

