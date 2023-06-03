import Knex from 'knex'
import EntityTransaction from '..'
import PgTestDbConfig from './support/pg/config.ts'

const Seneca = require('seneca')
const once = require('lodash.once')


describe('knex integration', () => {
  let knex

  beforeAll(() => {
    knex = Knex(PgTestDbConfig)
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


    test('trx started and committed in the same handler', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.add('hello:world', function (msg, reply) {
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
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
      	this.act('hello:world', fin)
      })
    })


    test('trx started and rolled back in the same handler', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.add('hello:world', function (msg, reply) {
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
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.ready(function () {
      	this.act('hello:world', fin)
      })
    })


    test('trx started, trx committed in a subhandler (test 1)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.add('bonjour:monde', function (msg, reply) {
	this.transaction().commit()
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.add('hello:world', function (msg, reply) {
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

	  await new Promise((resolve, reject) => {
	    senecatrx.act('bonjour:monde', function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

	  expect(await countRecords(knex('seneca_users'))).toEqual(2)
	}


	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('trx started, trx rolled back in a subhandler (test 1)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.add('bonjour:monde', function (msg, reply) {
	this.transaction().rollback()
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.add('hello:world', function (msg, reply) {
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

	  await new Promise((resolve, reject) => {
	    senecatrx.act('bonjour:monde', function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

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


    test('trx started, trx committed in a subhandler (test 2)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.add('bonjour:monde', function (msg, reply) {
      	async function impl() {
	  await knex_trx('seneca_users').insert({
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await this.transaction().commit()
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  const senecatrx = await this.transaction().start()

	  await knex_trx('seneca_users').insert({
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await new Promise((resolve, reject) => {
	    senecatrx.act('bonjour:monde', function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

	  expect(await countRecords(knex('seneca_users'))).toEqual(2)
	}


	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('trx started, trx rolled back in a subhandler (test 2)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.add('bonjour:monde', function (msg, reply) {
      	async function impl() {
	  await knex_trx('seneca_users').insert({
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await this.transaction().rollback()
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.add('hello:world', function (msg, reply) {
	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  const senecatrx = await this.transaction().start()

	  await knex_trx('seneca_users').insert({
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await new Promise((resolve, reject) => {
	    senecatrx.act('bonjour:monde', function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

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


    test('trx started, trx committed in a subhandler (test 3)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.add('bonjour:monde', function (msg, reply) {
      	async function impl() {
	  await knex_trx('seneca_users').insert({
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await knex_trx('seneca_users').insert({
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await this.transaction().commit()
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

	  expect(await countRecords(knex('seneca_users'))).toEqual(2)
	}


	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('trx started, trx rolled back in a subhandler (test 3)', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.add('bonjour:monde', function (msg, reply) {
      	async function impl() {
	  await knex_trx('seneca_users').insert({
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await knex_trx('seneca_users').insert({
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await this.transaction().rollback()
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


    describe('trx started, trx committed in the act-callback', () => {
      test('works ok', (fin_) => {
      	const fin = once(fin_)

	const seneca = Seneca().test(fin)
	seneca.use(EntityTransaction)
	seneca.use(MyTrxPlugin)


	seneca.add('bonjour:monde', function (msg, reply) {
	  reply()
	})

	seneca.add('hello:world', function (msg, reply) {
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

	    await new Promise((resolve, reject) => {
	      senecatrx.act('bonjour:monde', function (err) {
		if (err) return reject(err)

		this.transaction().commit()
		  .then(resolve)
		  .catch(reject)
	      })
	    })

	    expect(await countRecords(knex('seneca_users'))).toEqual(2)
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


    describe('trx started, trx rolled back in the act-callback', () => {
      test('works ok', (fin_) => {
      	const fin = once(fin_)

	const seneca = Seneca().test(fin)
	seneca.use(EntityTransaction)
	seneca.use(MyTrxPlugin)


	seneca.add('bonjour:monde', function (msg, reply) {
	  reply()
	})

	seneca.add('hello:world', function (msg, reply) {
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

	    await new Promise((resolve, reject) => {
	      senecatrx.act('bonjour:monde', function (err) {
		if (err) return reject(err)

		this.transaction().rollback()
		  .then(resolve)
		  .catch(reject)
	      })
	    })

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
    })


    test('trx started, trx committed down the "prior"-stack', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.add('hello:world', function (msg, reply) {
      	async function impl() {
	  await knex_trx('seneca_users').insert({
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await this.transaction().commit()
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.add('hello:world', function (msg, reply) {
      	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  const senecatrx = await this.transaction().start()

	  await knex_trx('seneca_users').insert({
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await new Promise((resolve, reject) => {
	    senecatrx.prior(msg, function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

	  expect(await countRecords(knex('seneca_users'))).toEqual(2)
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })


      seneca.ready(function () {
	this.act('hello:world', fin)
      })
    })


    test('trx started, trx rolled back down the "prior"-stack', (fin_) => {
      const fin = once(fin_)

      const seneca = Seneca().test(fin)
      seneca.use(EntityTransaction)
      seneca.use(MyTrxPlugin)


      seneca.add('hello:world', function (msg, reply) {
      	async function impl() {
	  await knex_trx('seneca_users').insert({
	    username: 'bob456',
	    email: 'bob@example.com'
	  })

	  await this.transaction().rollback()
	}

	impl.call(this)
	  .then(() => reply())
	  .catch(reply)
      })

      seneca.add('hello:world', function (msg, reply) {
      	async function impl() {
	  expect(await countRecords(knex('seneca_users'))).toEqual(0)

	  const senecatrx = await this.transaction().start()

	  await knex_trx('seneca_users').insert({
	    username: 'alice123',
	    email: 'alice@example.com'
	  })

	  await new Promise((resolve, reject) => {
	    senecatrx.prior(msg, function (err) {
	      if (err) return reject(err)
	      resolve()
	    })
	  })

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


    describe('trx started, trx committed in the callback to .prior()', () => {
      test('works ok', (fin_) => {
      	const fin = once(fin_)

	const seneca = Seneca().test(fin)
	seneca.use(EntityTransaction)
	seneca.use(MyTrxPlugin)


	seneca.add('hello:world', function (msg, reply) {
	  async function impl() {
	    await knex_trx('seneca_users').insert({
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

	    await knex_trx('seneca_users').insert({
	      username: 'alice123',
	      email: 'alice@example.com'
	    })

	    await new Promise((resolve, reject) => {
	      senecatrx.prior(msg, function (err) {
		if (err) return reject(err)

		knex_trx('seneca_users').insert({
		  username: 'charlie789',
		  email: 'charlie@example.com'
		})
		  .then(() => this.transaction().commit())
		  .then(resolve)
		  .catch(reject)
	      })
	    })

	    expect(await countRecords(knex('seneca_users'))).toEqual(3)
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


    describe('trx started, trx rolled back in the callback to .prior()', () => {
      test('works ok', (fin_) => {
      	const fin = once(fin_)

	const seneca = Seneca().test(fin)
	seneca.use(EntityTransaction)
	seneca.use(MyTrxPlugin)


	seneca.add('hello:world', function (msg, reply) {
	  async function impl() {
	    await knex_trx('seneca_users').insert({
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

	    await knex_trx('seneca_users').insert({
	      username: 'alice123',
	      email: 'alice@example.com'
	    })

	    await new Promise((resolve, reject) => {
	      senecatrx.prior(msg, function (err) {
		if (err) return reject(err)

		knex_trx('seneca_users').insert({
		  username: 'charlie789',
		  email: 'charlie@example.com'
		})
		  .then(() => this.transaction().rollback())
		  .then(resolve)
		  .catch(reject)
	      })
	    })

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
    })
  })
})


async function countRecords(knex) {
  const c = await knex.count().first()
  return Number(c.count)
}

