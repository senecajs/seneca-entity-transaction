import EntityTransaction from '..'
import Knex from 'knex'
const Seneca = require('seneca')
const once = require('lodash.once')


describe('knex integration', () => {
  let knex

  beforeAll(() => {
    knex = Knex({
      client: 'pg',
      connection: {
	host: '0.0.0.0',
	port: 5432,
	user: 'postgres',
	password: 'postgres',
	database: 'senecatest'
      }
    })
  })

  afterAll(async () => {
    await knex.destroy()
  })


  describe('example integration', () => {
    let knex_trx

    function MyTrxPlugin() {
      const trx_strategy = {
	async startTrx() {
	  const trx = await knex.transaction()
	  knex_trx = trx

	  return trx
	},

	async commitTrx(trx) {
	  await trx.ctx.commit()
	},

	async rollbackTrx(trx) {
	  await trx.ctx.rollback()
	}
      }

      this.export('entity-transaction/registerStrategy')(trx_strategy)
    }


    beforeEach(async () => {
      await knex('seneca_users').delete()
    })


    test('commit works ok', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)

      seneca.ready(runTest)


      function runTest() {
      	async function impl() {
      	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  const senecatrx = await this.transaction().start()

	  await knex_trx('seneca_users').insert({
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await knex_trx('seneca_users').insert({
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await senecatrx.transaction().commit()

      	  expect(await countRecords(knex('seneca_users'))).toEqual(2)
	}

	impl.call(this)
	  .then(() => fin())
	  .catch(fin)
      }
    })


    test('rollback works ok', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)

      seneca.ready(runTest)


      function runTest() {
      	async function impl() {
      	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  const senecatrx = await this.transaction().start()

	  await knex_trx('seneca_users').insert({
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await knex_trx('seneca_users').insert({
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await senecatrx.transaction().rollback()

      	  expect(await countRecords(knex('seneca_users'))).toEqual(0)
	}

	impl.call(this)
	  .then(() => fin())
	  .catch(fin)
      }
    })
  })
})


async function countRecords(knex) {
  const c = await knex.count().first()
  return Number(c.count)
}

