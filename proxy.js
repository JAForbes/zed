import * as Path from './path.js'

/**
 * This is a proxy handler with additional
 * methods and state that are referenced
 * by the traps.
 */
export class Handler {
	// set later
	proxy=null
	dependencies=new Set()
	constructor(
		path=Path.Path.of()
		, lifecycle=new Lifecycle()
		, getRootStates
		, proxyKeyCache
		, proxyReferenceCache
		, queryKeyReferences
	){
		this.path = path
		this.lifecycle = lifecycle
		this.getRootStates = getRootStates
		this.proxyKeyCache = proxyKeyCache
		this.proxyReferenceCache = proxyReferenceCache
		this.queryKeyReferences = queryKeyReferences
	}

	get $handler(){
		return this
	}

	get $path(){
		return this.path
	}

	get $dependencies(){
		return this.dependencies
	}

	get $type(){
		return 'z/proxy'
	}

	get $values(){
		let pp = PathProxy.of(
			Path.addParts( this.path, new Path.Traverse() )
			, this.lifecycle
			, this.getRootStates
			, this.proxyKeyCache
			, this.proxyReferenceCache
			, this.queryKeyReferences
		)
		this.dependencies.add(pp)
		return pp
	}

	$filter = (...args) => {
		let pp = PathProxy.of(
			Path.addParts( this.path, new Path.Filter(...args) )
			, this.lifecycle
			, this.getRootStates
			, this.proxyKeyCache
			, this.proxyReferenceCache
			, this.queryKeyReferences
		)
		this.dependencies.add(pp)
		return pp
	}

	$map = (...args) => {
		let pp = PathProxy.of(
			Path.addParts( this.path, new Path.Transform(...args) )
			, this.lifecycle
			, this.getRootStates
			, this.proxyKeyCache
			, this.proxyReferenceCache
			, this.queryKeyReferences
		)
		this.dependencies.add(pp)
		return pp
	}

	$delete = () => {
		let worked = this.path.remove({ states: this.getRootStates() })
		if(worked) {
			this.lifecycle.onremove(this)
		}

		// return true or proxy flips out
		return true
	}

	$$all = () => {
		return this.path.get({ states: this.getRootStates() })
	}

	$all = () => {
		let visitor = () => this.$$all()
		let out = this.lifecycle.onbeforeget( 
			this, visitor
		)
		return out
	}

	$default = (otherwise) => {
		let x = this.valueOf()
		if( typeof x == 'undefined' ) {
			return otherwise
		}
		return x
	}

	*[Symbol.iterator] (){
		yield * this.$all()
	}

	valueOf = () => {
		return this.lifecycle.onbeforeget( 
			this
			, () => this.path.get({ states: this.getRootStates() })
		)
		[0]
	}

	toString = () => {
		return this.valueOf()+''
	}

	compile(newPath){
		let pp = PathProxy.of( 
			newPath
			, this.lifecycle
			, this.getRootStates 
			, this.proxyKeyCache
			, this.proxyReferenceCache
			, this.queryKeyReferences
		)

		this.dependencies.add(pp)

		this.proxyKeyCache[newPath.key] = pp
		return pp
	}

	get(_, key){

		if (key == Symbol.iterator) {
			return this[key]
		} else if(typeof key == 'symbol' ) { 
			let value = this.valueOf()
			if( typeof value == 'undefined'){
				return undefined
			} else {
				return value[key]
			}
		}

			// assumes not empty
		let completeKey = this.path.parts.map( x => x.key ).concat(key).join('.')

		if( completeKey in this.proxyKeyCache ) {
			return this.proxyKeyCache[completeKey]
		} else if ( this.queryKeyReferences.has(completeKey) ){
			let realPath = this.queryKeyReferences.get(completeKey)
			
			if( realPath.key in this.proxyKeyCache ) {
				return this.proxyKeyCache[realPath.key]
			} else {
				return this.compile(realPath)
			}
		} else if (
			key.startsWith('$') 
			|| key == 'valueOf' 
			|| key == 'toString' 
		) {
			return this[key]
		} else {
			let newPath = Path.addParts( this.path, new Path.Property(key))
			return this.compile(newPath)
		}
	}

	setSelf(_, handler, visitor){
		
		let allowed = this.lifecycle.onbeforeset(handler, visitor)
		if( !allowed ) {
			return { updated: false };
		}
		let response = 
			handler.path.set({
				visitor, states: this.getRootStates() 
			})
			
		if (response.updated) {
			this.lifecycle.onset(handler, response.states, visitor)
		}
		return response
	}

	set(_, key, value){
		if ( this.proxyReferenceCache.has(value) ) {
			let realPath = value.$path
			let completeKey = [this.path.key, key].filter(Boolean).join('.')
			this.queryKeyReferences.set(completeKey, realPath)
		} else {
			let proxy = this.proxy[key]
			this.setSelf(_, proxy.$handler, () => value)
		}
		return true
	}

	apply(_, __, args){

		let existing = this.valueOf()
			
		if( typeof existing == 'function' ) {
			return Reflect.apply(existing, args)
		} else if (args.length == 0) {
			return existing
		} else if (typeof args[0] == 'function'){
			let response = this.setSelf(_, this, args[0])
			if (response.updated) {
				return response.states[0]
			}
			return undefined
		} else {
			let response = this.setSelf(_, this, () => args[0])
			if (response.updated) {
				return response.states[0]
			}
			return undefined
		}
	}

	deleteProperty(_, key){
		// create child or access child
		// so things like delete users.$values works
		let child = this.proxy[key]
		return child.$delete()
	}

}

/**
 * Supported lifecycle operations.
 * 
 * These are used internally to support
 * services.
 */
export class Lifecycle {
	oncreate(){}
	onremove(){}
	onbeforecreate(){}
	onbeforeget(_, f){ return f() }
	onbeforeset(){ return true }
	onset(){}
}

/**
 * A small wrapper around the proxy
 * that includes additional metadata
 * and a custom constructor for caching.
 */
export class PathProxy {
	constructor(
		handler=new Handler()
		, path=Path.Path.of()
		, proxy=new Proxy(function(){})
		, getRootStates
	){
		this.handler = handler
		this.proxy = proxy
		this.path = path
		this.getRootStates = getRootStates
	}

	static of(
		path
		, lifecycle=new Lifecycle()
		, getRootStates
		, proxyKeyCache
		, proxyReferenceCache
		, queryKeyReferences
	){

		{
			let x = lifecycle.onbeforecreate({ path })
			if( x ) return x
		}

		const handler = 
			new Handler(
				path
				, lifecycle
				, getRootStates
				, proxyKeyCache
				, proxyReferenceCache
				, queryKeyReferences
			)

		const proxy = new Proxy(function(){}, handler)
		handler.proxy = proxy

		let out = new PathProxy(
			handler
			, path
			, proxy
			, getRootStates
		)

		try {
			return out.proxy
		} finally {
			lifecycle.oncreate(out)
		}
	
	}
}