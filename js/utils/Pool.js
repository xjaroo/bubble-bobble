/**
 * Simple object pool.  Pass a factory function; call acquire() / release().
 * Prevents GC pressure during gameplay.
 */
export class Pool {
    constructor(factory, initialSize = 16) {
        this._factory = factory;
        this._pool    = [];
        for (let i = 0; i < initialSize; i++) {
            this._pool.push(factory());
        }
    }

    acquire() {
        return this._pool.length > 0 ? this._pool.pop() : this._factory();
    }

    release(obj) {
        obj.active = false;
        this._pool.push(obj);
    }
}
