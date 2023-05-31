/* Copyright © 2021-2022 Richard Rodger, MIT License. */


import { Open, Skip } from 'gubu'


type GatewayResult = {
  // The action result (transport externalized).
  // OR: a description of the error.
  out: any | {

    // Externalized meta.
    meta$: any

    // Extracted from Error object
    error$: {
      name: string
      code?: string
      message?: string
      details?: any
    }
  }

  // Indicate if result was an error.
  error: boolean

  // Original meta object.
  meta?: any

  // Gateway directives embedded in action result.
  // NOTE: $ suffix as output directive.
  gateway$?: Record<string, any>
}


type GatewayOptions = {
  allow: any,
  custom: any
  fixed: any,
  error: {
    message: boolean
    details: boolean
  }
  debug: boolean
}


function gateway(this: any, options: GatewayOptions) {
  let seneca: any = this
  const root: any = seneca.root
  const tu: any = seneca.export('transport/utils')

  const Patrun = seneca.util.Patrun
  const Jsonic = seneca.util.Jsonic
  const allowed = new Patrun({ gex: true })

  const checkAllowed = null != options.allow
  // console.log('CA', checkAllowed, options)

  if (checkAllowed) {
    for (let patStr in options.allow) {
      let pat = Jsonic(patStr)
      allowed.add(pat, true)
    }
  }


  const hooknames = [

    // Functions to modify the custom object in Seneca message meta$ descriptions
    'custom',

    // Functions to modify the fixed arguments to Seneca messages
    'fixed',

    // Functions to modify the seneca request delegate
    'delegate',

    // TODO: rename: before
    // Functions to modify the action or message
    'action',

    // TODO: rename: after
    // Functions to modify the result
    'result'
  ]

  const hooks: any = hooknames.reduce((a: any, n) => (a[n] = [], a), {})

  const tag = seneca.plugin.tag
  if (null != tag && '-' !== tag) {
    seneca = seneca.fix({ tag })
  }


  seneca.message('sys:gateway,add:hook', async function add_hook(msg: any) {
    let hook: string = msg.hook
    let action: (...params: any[]) => any = msg.action

    if (null != action) {
      let hookactions = hooks[hook]
      hookactions.push(action)
      return { ok: true, hook, count: hookactions.length }
    }
    else {
      // TODO: this should fail, as usually a startup action
      // this.throw('no-action', {hook})
      return { ok: false, why: 'no-action' }
    }
  })


  seneca.message('sys:gateway,get:hooks', async function get_hook(msg: any) {
    let hook: string = msg.hook
    let hookactions = hooks[hook]
    return { ok: true, hook, count: hookactions.length, hooks: hookactions }
  })


  // Handle inbound JSON, converting it into a message, and submitting to Seneca.
  async function handler(json: any, ctx: any) {
    const seneca = await prepare(json, ctx)
    const rawmsg = tu.internalize_msg(seneca, json)

    const msg = seneca.util.clean(rawmsg)

    return await new Promise(async (resolve) => {
      if (checkAllowed) {
        let allowMsg = false

        // First, find msg that will be called
        let msgdef = seneca.find(msg)
        if (msgdef) {
          // Second, check found msg matches allowed patterns
          // NOTE: just doing allowed.find(msg) will enable separate messages
          // to sneak in: if foo:1 is allowed but not defined, foo:1,role:seneca,...
          // will still work, which is not what we want!
          allowMsg = !!allowed.find(msgdef.msgcanon)
        }

        if (!allowMsg) {
          return resolve({
            error: true,
            out: {
              meta$: { id: rawmsg.id$ },
              error$: nundef({
                name: 'Error',
                code: 'not-allowed',
                message: 'Message not allowed',
                details: undefined,
              })
            }
          })
        }
      }

      let out = null
      for (var i = 0; i < hooks.action.length; i++) {
        out = await hooks.action[i].call(seneca, msg, ctx)
        if (out) {
          return resolve(out)
        }
      }

      seneca.act(msg, async function(this: any, err: any, out: any, meta: any) {
        for (var i = 0; i < hooks.result.length; i++) {
          await hooks.result[i].call(seneca, out, msg, err, meta, ctx)
        }

        if (err && !options.debug) {
          err.stack = null
        }

        out = tu.externalize_reply(this, err, out, meta)

        // Don't expose internal activity unless debugging
        if (!options.debug) {
          if (out.meta$) {
            out.meta$ = {
              id: out.meta$.id
            }
          }
        }

        let result: GatewayResult = {
          error: false,
          out,
          meta,
          gateway$: out.gateway$ || {}
        }

        // Directives in gateway$ moved to result
        delete out.gateway$

        if (err) {
          result.error = true
          result.out = {
            meta$: out.meta$,
            error$: nundef({
              name: err.name,
              code: (err as any).code,
              message: options.error.message ? err.message : undefined,
              details: options.error.details ? err.details : undefined,
            })
          }
        }

        resolve(result)
      })
    })
  }


  async function prepare(json: any, ctx: any) {
    let i, hookaction

    let custom: any = seneca.util.deep({}, options.custom)
    for (i = 0; i < hooks.custom.length; i++) {
      hookaction = hooks.custom[i]
      if ('object' === typeof (hookaction)) {
        custom = seneca.util.deep(custom, hookaction)
      }
      else {
        await hookaction(custom, json, ctx)
      }
    }


    let fixed: any = seneca.util.deep({}, options.fixed)
    for (i = 0; i < hooks.fixed.length; i++) {
      hookaction = hooks.fixed[i]
      if ('object' === typeof (hookaction)) {
        fixed = seneca.util.deep(fixed, hookaction)
      }
      else {
        await hookaction(fixed, json, ctx)
      }
    }

    // NOTE: a new delegate is created for each request to ensure isolation.
    const delegate = root.delegate(fixed, { custom: custom })

    for (i = 0; i < hooks.delegate.length; i++) {
      await hooks.delegate[i].call(delegate, json, ctx)
    }

    return delegate
  }


  function parseJSON(data: any) {
    if (null == data) return {}

    let str = String(data)

    try {
      return JSON.parse(str)
    } catch (e: any) {
      e.handler$ = {
        error$: e.message,
        input$: str,
      }
      return e
    }
  }

  return {
    exports: {
      handler,
      parseJSON,
    }
  }
}


function nundef(o: any) {
  for (let p in o) {
    if (undefined === o[p]) {
      delete o[p]
    }
  }
  return o
}


// Default options.
gateway.defaults = {

  allow: Skip(Open({})),

  custom: Open({

    // Assume gateway is used to handle external messages.
    safe: false
  }),

  fixed: Open({}),

  error: {
    // Include exception object message property in response.
    message: false,

    // Include exception object details property in response.
    details: false,
  },

  // When true, errors will include stack trace.
  debug: false
}


export type {
  GatewayOptions,
  GatewayResult,
}

export default gateway

if ('undefined' !== typeof (module)) {
  module.exports = gateway
}
