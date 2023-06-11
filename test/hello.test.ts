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
    //await knex.destroy()
  })

  test('', (fin_) => {
    const fin = once(fin_)
    fin()
  })
})
