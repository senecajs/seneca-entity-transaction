import Knex from 'knex'
import EntityTransaction from '..'
import PgTestDbConfig from './support/pg/config.ts'

const Seneca = require('seneca')
const SenecaEntity = require('seneca-entity')
const once = require('lodash.once')


describe('example store integration', () => {
  function MyPreciousStorePlugin(opts) {
    const seneca = this
    const knex = opts.getKnex()

    const tableName = ent => {
      const canon = ent.canon$({ object: true })
      return canon.name
    }

    const store = {
      name: 'MyPrecious',

      save(msg, reply) {
      	reply()
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


  let knex

  beforeAll(() => {
    //knex = Knex(PgTestDbConfig)
  })

  afterAll(async () => {
    //await knex.destroy()
  })


  test('watch this', (fin_) => {
    const fin = once(fin_)

    const seneca = Seneca().test(fin)
    seneca.use(SenecaEntity)

    seneca.use(MyPreciousStorePlugin, {
      getKnex() {
      	return knex
      }
    })


    seneca.ready(async function () {
      await new Promise((resolve, reject) => {
	this.make$('seneca_users')
	  .data$({
	    username: 'alice123',
	    email: 'alice@example.com'
	  })
	  .save$((err) => {
	    if (err) return reject(err)
	    resolve()
	  })
      })

      fin()
    })
  })
})
