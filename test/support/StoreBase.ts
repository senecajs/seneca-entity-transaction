
class StoreBase {
  constructor(name) {
    this.name = name
  }

  save(seneca, msg, callback) {
    callback(new Error('not implemented'))
  }

  load(seneca, msg, callback) {
    callback(new Error('not implemented'))
  }

  list(seneca, msg, callback) {
    callback(new Error('not implemented'))
  }

  remove(seneca, msg, callback) {
    callback(new Error('not implemented'))
  }

  native(seneca, callback) {
    callback(new Error('not implemented'))
  }

  close(seneca, callback) {
    callback(new Error('not implemented'))
  }

  asSenecaStore() {
    const self = this

    return {
      name: self.name,

      save(msg, callback) {
      	const seneca = this
      	return self.save(seneca, msg, callback)
      },

      load(msg, reply) {
      	const seneca = this
      	return self.load(seneca, msg, callback)
      },

      list(msg, reply) {
      	const seneca = this
      	return self.list(seneca, msg, callback)
      },

      remove(msg, reply) {
      	const seneca = this
      	return self.remove(seneca, msg, callback)
      },

      native(reply) {
      	const seneca = this
      	return self.native(seneca, msg, callback)
      },

      close(reply) {
      	const seneca = this
      	return self.close(seneca, msg, callback)
      }
    }
  }
}


export default StoreBase
