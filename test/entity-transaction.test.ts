import EntityTransaction from '..'
const Seneca = require('seneca')
const once = require('lodash.once')


describe('entity-transaction', () => {
  function MyTrxPlugin() {
      const trx_strategy = {
	async startTrx() {
	  return "pretend I'm a T-Rex"
	},

	async commitTrx() {
	},

	async rollbackTrx() {
	}
      }

      this.export('entity-transaction/registerStrategy')(trx_strategy)
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

