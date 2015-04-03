!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.µ=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Microbe = require( './core/' );
require( './core/init' )( Microbe );
require( './dom/' )( Microbe );
require( './http/' )( Microbe );
require( './observe/' )( Microbe );

module.exports = Microbe;

},{"./core/":12,"./core/init":13,"./dom/":14,"./http/":16,"./observe/":17}],2:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],3:[function(require,module,exports){
(function (global){
//    Copyright 2012 Kap IT (http://www.kapit.fr/)
//
//    Licensed under the Apache License, Version 2.0 (the 'License');
//    you may not use this file except in compliance with the License.
//    You may obtain a copy of the License at
//
//        http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an 'AS IS' BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//    See the License for the specific language governing permissions and
//    limitations under the License.
//    Author : François de Campredon (http://francois.de-campredon.fr/),

// Object.observe Shim
// ===================

// *See [The harmony proposal page](http://wiki.ecmascript.org/doku.php?id=harmony:observe)*

(function (global) {
    'use strict';

    // Utilities
    // ---------

    // setImmediate shim used to deliver changes records asynchronously
    // use setImmediate if available
    var setImmediate = global.setImmediate || global.msSetImmediate,
        clearImmediate = global.clearImmediate || global.msClearImmediate;
    if (!setImmediate) {
        // fallback on setTimeout if not
        setImmediate = function (func, args) {
            return setTimeout(func, 0, args);
        };
        clearImmediate = function (id) {
            clearTimeout(id);
        };
    }


    // WeakMap
    // -------

    var PrivateMap;
    if (typeof WeakMap !== 'undefined')  {
        //use weakmap if defined
        PrivateMap = WeakMap;
    } else {
        //else use ses like shim of WeakMap
        /* jshint -W016 */
        var HIDDEN_PREFIX = '__weakmap:' + (Math.random() * 1e9 >>> 0),
            counter = new Date().getTime() % 1e9,
            mascot = {};

        PrivateMap = function () {
            this.name = HIDDEN_PREFIX + (Math.random() * 1e9 >>> 0) + (counter++ + '__');
        };

        PrivateMap.prototype = {
            has: function (key) {
                return key && key.hasOwnProperty(this.name);
            },

            get: function (key) {
                var value = key && key[this.name];
                return value === mascot ? undefined : value;
            },

            set: function (key, value) {
                Object.defineProperty(key, this.name, {
                    value : typeof value === 'undefined' ? mascot : value,
                    enumerable: false,
                    writable : true,
                    configurable: true
                });
            },

            'delete': function (key) {
                return delete key[this.name];
            }
        };


        var getOwnPropertyName = Object.getOwnPropertyNames;
        Object.defineProperty(Object, 'getOwnPropertyNames', {
            value: function fakeGetOwnPropertyNames(obj) {
                return getOwnPropertyName(obj).filter(function (name) {
                    return name.substr(0, HIDDEN_PREFIX.length) !== HIDDEN_PREFIX;
                });
            },
            writable: true,
            enumerable: false,
            configurable: true
        });
    }


    // Internal Properties
    // -------------------

    // An ordered list used to provide a deterministic ordering in which callbacks are called.
    // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_internals#observercallbacks)
    var observerCallbacks = [];

    // This object is used as the prototype of all the notifiers that are returned by Object.getNotifier(O).
    // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_internals#notifierprototype)
    var NotifierPrototype = Object.create(Object.prototype);

    // Used to store immediate uid reference
    var changeDeliveryImmediateUid;

    // Used to schedule a call to _deliverAllChangeRecords
    function setUpChangesDelivery() {
        clearImmediate(changeDeliveryImmediateUid);
        changeDeliveryImmediateUid = setImmediate(_deliverAllChangeRecords);
    }

    Object.defineProperty(NotifierPrototype, 'notify', {
        value: function notify(changeRecord) {
            var notifier = this;
            if (Object(notifier) !== notifier) {
                throw new TypeError('this must be an Object, given ' + notifier);
            }
            if (!notifier.__target) {
                return;
            }
            if (Object(changeRecord) !== changeRecord) {
                throw new TypeError('changeRecord must be an Object, given ' + changeRecord);
            }


            var type = changeRecord.type;
            if (typeof type !== 'string') {
                throw new TypeError('changeRecord.type must be a string, given ' + type);
            }

            var changeObservers = changeObserversMap.get(notifier);
            if (!changeObservers || changeObservers.length === 0) {
                return;
            }
            var target = notifier.__target,
                newRecord = Object.create(Object.prototype, {
                    'object': {
                        value: target,
                        writable : false,
                        enumerable : true,
                        configurable: false
                    }
                });
            for (var prop in changeRecord) {
                if (prop !== 'object') {
                    var value = changeRecord[prop];
                    Object.defineProperty(newRecord, prop, {
                        value: value,
                        writable : false,
                        enumerable : true,
                        configurable: false
                    });
                }
            }
            Object.preventExtensions(newRecord);
            _enqueueChangeRecord(notifier.__target, newRecord);
        },
        writable: true,
        enumerable: false,
        configurable : true
    });

    Object.defineProperty(NotifierPrototype, 'performChange', {
        value: function performChange(changeType, changeFn) {
            var notifier = this;
            if (Object(notifier) !== notifier) {
                throw new TypeError('this must be an Object, given ' + notifier);
            }
            if (!notifier.__target) {
                return;
            }
            if (typeof changeType !== 'string') {
                throw new TypeError('changeType must be a string given ' + notifier);
            }
            if (typeof changeFn !== 'function') {
                throw new TypeError('changeFn must be a function, given ' + changeFn);
            }

            _beginChange(notifier.__target, changeType);
            var error, changeRecord;
            try {
                changeRecord = changeFn.call(undefined);
            } catch (e) {
                error = e;
            }
            _endChange(notifier.__target, changeType);
            if (typeof error !== 'undefined') {
                throw error;
            }

            var changeObservers = changeObserversMap.get(notifier);
            if (changeObservers.length === 0) {
                return;
            }

            var target = notifier.__target,
                newRecord = Object.create(Object.prototype, {
                    'object': {
                        value: target,
                        writable : false,
                        enumerable : true,
                        configurable: false
                    },
                    'type': {
                        value: changeType,
                        writable : false,
                        enumerable : true,
                        configurable: false
                    }
                });
            if (typeof changeRecord !== 'undefined') {
                for (var prop in changeRecord) {
                    if (prop !== 'object' && prop !== 'type') {
                        var value = changeRecord[prop];
                        Object.defineProperty(newRecord, prop, {
                            value: value,
                            writable : false,
                            enumerable : true,
                            configurable: false
                        });
                    }
                }
            }

            Object.preventExtensions(newRecord);
            _enqueueChangeRecord(notifier.__target, newRecord);

        },
        writable: true,
        enumerable: false,
        configurable : true
    });

    // Implementation of the internal algorithm 'BeginChange'
    // described in the proposal.
    // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_internals#beginchange)
    function _beginChange(object, changeType) {
        var notifier = Object.getNotifier(object),
            activeChanges = activeChangesMap.get(notifier),
            changeCount = activeChangesMap.get(notifier)[changeType];
        activeChanges[changeType] = typeof changeCount === 'undefined' ? 1 : changeCount + 1;
    }

    // Implementation of the internal algorithm 'EndChange'
    // described in the proposal.
    // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_internals#endchange)
    function _endChange(object, changeType) {
        var notifier = Object.getNotifier(object),
            activeChanges = activeChangesMap.get(notifier),
            changeCount = activeChangesMap.get(notifier)[changeType];
        activeChanges[changeType] = changeCount > 0 ? changeCount - 1 : 0;
    }

    // Implementation of the internal algorithm 'ShouldDeliverToObserver'
    // described in the proposal.
    // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_internals#shoulddelivertoobserver)
    function _shouldDeliverToObserver(activeChanges, acceptList, changeType) {
        var doesAccept = false;
        if (acceptList) {
            for (var i = 0, l = acceptList.length; i < l; i++) {
                var accept = acceptList[i];
                if (activeChanges[accept] > 0) {
                    return false;
                }
                if (accept === changeType) {
                    doesAccept = true;
                }
            }
        }
        return doesAccept;
    }


    // Map used to store corresponding notifier to an object
    var notifierMap = new PrivateMap(),
        changeObserversMap = new PrivateMap(),
        activeChangesMap = new PrivateMap();

    // Implementation of the internal algorithm 'GetNotifier'
    // described in the proposal.
    // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_internals#getnotifier)
    function _getNotifier(target) {
        if (!notifierMap.has(target)) {
            var notifier = Object.create(NotifierPrototype);
            // we does not really need to hide this, since anyway the host object is accessible from outside of the
            // implementation. we just make it unwritable
            Object.defineProperty(notifier, '__target', { value : target });
            changeObserversMap.set(notifier, []);
            activeChangesMap.set(notifier, {});
            notifierMap.set(target, notifier);
        }
        return notifierMap.get(target);
    }



    // map used to store reference to a list of pending changeRecords
    // in observer callback.
    var pendingChangesMap = new PrivateMap();

    // Implementation of the internal algorithm 'EnqueueChangeRecord'
    // described in the proposal.
    // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_internals#enqueuechangerecord)
    function _enqueueChangeRecord(object, changeRecord) {
        var notifier = Object.getNotifier(object),
            changeType = changeRecord.type,
            activeChanges = activeChangesMap.get(notifier),
            changeObservers = changeObserversMap.get(notifier);

        for (var i = 0, l = changeObservers.length; i < l; i++) {
            var observerRecord = changeObservers[i],
                acceptList = observerRecord.accept;
            if (_shouldDeliverToObserver(activeChanges, acceptList, changeType)) {
                var observer = observerRecord.callback,
                    pendingChangeRecords = [];
                if (!pendingChangesMap.has(observer))  {
                    pendingChangesMap.set(observer, pendingChangeRecords);
                } else {
                    pendingChangeRecords = pendingChangesMap.get(observer);
                }
                pendingChangeRecords.push(changeRecord);
            }
        }
        setUpChangesDelivery();
    }

    // map used to store a count of associated notifier to a function
    var attachedNotifierCountMap = new PrivateMap();

    // Remove reference all reference to an observer callback,
    // if this one is not used anymore.
    // In the proposal the ObserverCallBack has a weak reference over observers,
    // Without this possibility we need to clean this list to avoid memory leak
    function _cleanObserver(observer) {
        if (!attachedNotifierCountMap.get(observer) && !pendingChangesMap.has(observer)) {
            attachedNotifierCountMap.delete(observer);
            var index = observerCallbacks.indexOf(observer);
            if (index !== -1) {
                observerCallbacks.splice(index, 1);
            }
        }
    }

    // Implementation of the internal algorithm 'DeliverChangeRecords'
    // described in the proposal.
    // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_internals#deliverchangerecords)
    function _deliverChangeRecords(observer) {
        var pendingChangeRecords = pendingChangesMap.get(observer);
        pendingChangesMap.delete(observer);
        if (!pendingChangeRecords || pendingChangeRecords.length === 0) {
            return false;
        }
        try {
            observer.call(undefined, pendingChangeRecords);
        }
        catch (e) { }

        _cleanObserver(observer);
        return true;
    }

    // Implementation of the internal algorithm 'DeliverAllChangeRecords'
    // described in the proposal.
    // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_internals#deliverallchangerecords)
    function _deliverAllChangeRecords() {
        var observers = observerCallbacks.slice();
        var anyWorkDone = false;
        for (var i = 0, l = observers.length; i < l; i++) {
            var observer = observers[i];
            if (_deliverChangeRecords(observer)) {
                anyWorkDone = true;
            }
        }
        return anyWorkDone;
    }


    Object.defineProperties(Object, {
        // Implementation of the public api 'Object.observe'
        // described in the proposal.
        // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_public_api#object.observe)
        'observe': {
            value: function observe(target, callback, accept) {
                if (Object(target) !== target) {
                    throw new TypeError('target must be an Object, given ' + target);
                }
                if (typeof callback !== 'function') {
                    throw new TypeError('observer must be a function, given ' + callback);
                }
                if (Object.isFrozen(callback)) {
                    throw new TypeError('observer cannot be frozen');
                }

                var acceptList;
                if (typeof accept === 'undefined') {
                    acceptList = ['add', 'update', 'delete', 'reconfigure', 'setPrototype', 'preventExtensions'];
                } else {
                    if (Object(accept) !== accept) {
                        throw new TypeError('accept must be an object, given ' + accept);
                    }
                    var len = accept.length;
                    if (typeof len !== 'number' || len >>> 0 !== len || len < 1) {
                        throw new TypeError('the \'length\' property of accept must be a positive integer, given ' + len);
                    }

                    var nextIndex = 0;
                    acceptList = [];
                    while (nextIndex < len) {
                        var next = accept[nextIndex];
                        if (typeof next !== 'string') {
                            throw new TypeError('accept must contains only string, given' + next);
                        }
                        acceptList.push(next);
                        nextIndex++;
                    }
                }


                var notifier = _getNotifier(target),
                    changeObservers = changeObserversMap.get(notifier);

                for (var i = 0, l = changeObservers.length; i < l; i++) {
                    if (changeObservers[i].callback === callback) {
                        changeObservers[i].accept = acceptList;
                        return target;
                    }
                }

                changeObservers.push({
                    callback: callback,
                    accept: acceptList
                });

                if (observerCallbacks.indexOf(callback) === -1)  {
                    observerCallbacks.push(callback);
                }
                if (!attachedNotifierCountMap.has(callback)) {
                    attachedNotifierCountMap.set(callback, 1);
                } else {
                    attachedNotifierCountMap.set(callback, attachedNotifierCountMap.get(callback) + 1);
                }
                return target;
            },
            writable: true,
            configurable: true
        },

        // Implementation of the public api 'Object.unobseve'
        // described in the proposal.
        // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_public_api#object.unobseve)
        'unobserve': {
            value: function unobserve(target, callback) {
                if (Object(target) !== target) {
                    throw new TypeError('target must be an Object, given ' + target);
                }
                if (typeof callback !== 'function') {
                    throw new TypeError('observer must be a function, given ' + callback);
                }
                var notifier = _getNotifier(target),
                    changeObservers = changeObserversMap.get(notifier);
                for (var i = 0, l = changeObservers.length; i < l; i++) {
                    if (changeObservers[i].callback === callback) {
                        changeObservers.splice(i, 1);
                        attachedNotifierCountMap.set(callback, attachedNotifierCountMap.get(callback) - 1);
                        _cleanObserver(callback);
                        break;
                    }
                }
                return target;
            },
            writable: true,
            configurable: true
        },

        // Implementation of the public api 'Object.deliverChangeRecords'
        // described in the proposal.
        // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_public_api#object.deliverchangerecords)
        'deliverChangeRecords': {
            value: function deliverChangeRecords(observer) {
                if (typeof observer !== 'function') {
                    throw new TypeError('callback must be a function, given ' + observer);
                }
                while (_deliverChangeRecords(observer)) {}
            },
            writable: true,
            configurable: true
        },

        // Implementation of the public api 'Object.getNotifier'
        // described in the proposal.
        // [Corresponding Section in ECMAScript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:observe_public_api#object.getnotifier)
        'getNotifier': {
            value: function getNotifier(target) {
                if (Object(target) !== target) {
                    throw new TypeError('target must be an Object, given ' + target);
                }
                if (Object.isFrozen(target)) {
                    return null;
                }
                return _getNotifier(target);
            },
            writable: true,
            configurable: true
        }

    });

})(typeof global !== 'undefined' ? global : this);



}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],4:[function(require,module,exports){
//    Copyright 2012 Kap IT (http://www.kapit.fr/)
//
//    Licensed under the Apache License, Version 2.0 (the 'License');
//    you may not use this file except in compliance with the License.
//    You may obtain a copy of the License at
//
//        http://www.apache.org/licenses/LICENSE-2.0
//
//    Unless required by applicable law or agreed to in writing, software
//    distributed under the License is distributed on an 'AS IS' BASIS,
//    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//    See the License for the specific language governing permissions and
//    limitations under the License.
//    Author : François de Campredon (http://francois.de-campredon.fr/),

// ObjectUtils
// ===========

(function (global) {
    'use strict';

    /**
     * @namespace
     */
    var ObserveUtils = {};
    if ( typeof module === 'object' && typeof exports !== 'undefined') {
        module.exports = ObserveUtils;
    } else {
        global.ObserveUtils = ObserveUtils;
    }

    // Utilities
    // ---------


    // borrowing some array methods
    var arrSlice = Function.call.bind(Array.prototype.slice),
        arrMap = Function.call.bind(Array.prototype.map);

    // return true if the given property descriptor contains accessor
    function isAccessorDescriptor(desc) {
        if (typeof desc === 'undefined') {
            return false;
        }
        return ('get' in desc || 'set' in desc);
    }



    // getPropertyDescriptor shim
    // copied from [es6-shim](https://github.com/paulmillr/es6-shim)
    function getPropertyDescriptor(target, name) {
        var pd = Object.getOwnPropertyDescriptor(target, name),
            proto = Object.getPrototypeOf(target);
        while (typeof pd === 'undefined' && proto !== null) {
            pd = Object.getOwnPropertyDescriptor(proto, name);
            proto = Object.getPrototypeOf(proto);
        }
        return pd;
    }



    // egal shim
    // copied from [the ecmascript wiki](http://wiki.ecmascript.org/doku.php?id=harmony:egal)
    function sameValue(x, y) {
        if (x === y) {
            // 0 === -0, but they are not identical
            return x !== 0 || 1 / x === 1 / y;
        }

        // NaN !== NaN, but they are identical.
        // NaNs are the only non-reflexive value, i.e., if x !== x,
        // then x is a NaN.
        // isNaN is broken: it converts its argument to number, so
        // isNaN('foo') => true
        return x !== x && y !== y;
    }

    // cast a value as number, and test if the obtained result
    // is a positive finite integer, throw an error otherwise
    function isPositiveFiniteInteger(value, errorMessage) {
        value = Number(value);
        if (isNaN(value) || !isFinite(value) || value < 0 || value % 1 !== 0) {
            throw new RangeError(errorMessage.replace('$', value));
        }
        return value;
    }

    // defineObservableProperties Implementation
    // ------------------------------------------

    // Uid generation helper
    var uidCounter = 0;

    // Define a property on an object that will call the Notifier.notify method when updated
    function defineObservableProperty(target, property, originalValue) {

        //we store the value in an non-enumerable property with generated unique name
        var internalPropName = '_' + (uidCounter++) + property;

        if (target.hasOwnProperty(property)) {
            Object.defineProperty(target, internalPropName, {
                value: originalValue,
                writable: true,
                enumerable: false,
                configurable: true
            });
        }

        //then we create accessor method for our 'hidden' property,
        // that dispatch changesRecords when the value is updated
        Object.defineProperty(target, property, {
            get: function () {
                return this[internalPropName];
            },
            set: function (value) {
                if (!sameValue(value, this[internalPropName])) {
                    var oldValue = this[internalPropName];
                    Object.defineProperty(this, internalPropName, {
                        value: value,
                        writable: true,
                        enumerable: false,
                        configurable: true
                    });
                    var notifier = Object.getNotifier(this);
                    notifier.notify({ type: 'update', name: property, oldValue: oldValue });
                }
            },
            enumerable: true,
            configurable: true
        });
    }


    // call defineObservableProperty for each property name passed as 'rest argument'

    /**
     * Define observable properties on the given object an return it.
     *
     * @param {Object} target
     * @param {...string} properties
     * @returns {Object}
     */
    ObserveUtils.defineObservableProperties = function defineObservableProperties(target, properties) {
        if (Object(target) !== target) {
            throw new TypeError('target must be an Object, given ' + target);
        }
        properties = arrSlice(arguments, 1);
        while (properties.length > 0) {
            var property = properties.shift(),
                descriptor = getPropertyDescriptor(target, property);

            if (!descriptor || !isAccessorDescriptor(descriptor)) {
                var originalValue = descriptor && descriptor.value;
                defineObservableProperty(target, property, originalValue);
            }
        }
        return target;
    };



    // List Implementation
    // ------------------------------------------

    /**
     *
     * @param length
     * @returns {*}
     * @constructor
     * @function
     */
    function List(length) {
        if (arguments.length === 0) {
            length = 0;
        }

        // in this case we create a list with a given length
        if (arguments.length <= 1 && typeof length === 'number') {
            if (this instanceof List) {
                this.length = length;
            }
            else {
                return new List(length);
            }
        }
        else {
            //here we create a list with initial values
            if (!(this instanceof List)) {
                return List.fromArray(arrSlice(arguments));
            }
            else {
                for (var i = 0, l = arguments.length ; i < l ; i++) {
                    this[i] = arguments[i];
                }
                this.length = arguments.length;
            }
        }
    }

    /**
     * Observe a list
     * @param {List} list
     * @param {function} observer
     */
    List.observe = function observe(list, observer) {
        Object.observe(list, observer, ['add', 'update', 'delete', 'splice']);
    };


    /**
     * Unobserve a list
     * @param {List} list
     * @param {function} observer
     */
    List.unobserve = function unobserve(list, observer) {
        Object.unobserve(list, observer);
    };

    /**
     * Create a list from a given array
     * @param array
     * @returns {List}
     */
    List.fromArray = function fromArray(array) {
        if (!Array.isArray(array)) {
            throw new Error();
        }

        var list = new List();
        for (var i = 0, l = array.length ; i < l ; i++) {
            list[i] = array[i];
        }
        list.length = array.length;
        return list;
    };

    Object.defineProperties(List.prototype, {
        /**
         * hidden value holder for the length property
         * @private
         */
        '_length' : {
            value : 0,
            enumerable: false,
            configurable: true,
            writable: true
        },
        /**
         * the length of the list
         * @property {number} length
         */
        'length' : {
            get : function () {
                return this._length;
            },
            set : function (value) {
                value = isPositiveFiniteInteger(value, 'Invalid  list length : $');
                var notifier = Object.getNotifier(this),
                    oldValue = this._length,
                    removed = [],
                    self = this;
                if (value !== oldValue) {
                    notifier.performChange('splice', function () {
                        Object.defineProperty(self, '_length', {
                            value : value,
                            enumerable: false,
                            configurable: true,
                            writable: true
                        });

                        var returnValue;
                        if (oldValue > value) {
                            //delete values if the length have been decreased
                            for (var i = value; i < oldValue; i++) {
                                removed.push(self[i]);
                                self.delete(i);
                            }
                            returnValue = {
                                index : value,
                                removed : removed,
                                addedCount: 0
                            };
                        } else {
                            returnValue = {
                                index : oldValue,
                                removed : removed,
                                addedCount: value - oldValue
                            };
                        }
                        notifier.notify({ type: 'update', name: 'length', oldValue: oldValue });

                        return returnValue;
                    });
                }

            },
            enumerable: true,
            configurable : true
        }
    });

    /**
     * Returns an Array copy of the list
     * @returns {Array}
     */
    List.prototype.toArray = function toArray() {
        return arrSlice(this);
    };

    /**
     * Returns an string representation of the list
     * @returns {string}
     */
    List.prototype.toString = function toString() {
        return this.toArray().toString();
    };


    /**
     * Returns an json representation of the list
     * @returns {string}
     */
    List.prototype.toJSON = function toJSON() {
        return this.toArray();
    };

    /**
     * set the givent value at the specified index.
     * @param {number} index
     * @param {*} value
     * @return {*}
     */
    List.prototype.set = function set(index, value) {
        index = isPositiveFiniteInteger(index, 'Invalid index : $');

        var notifier = Object.getNotifier(this),
            len = this.length,
            self = this;
        if (index >= len) {
            notifier.performChange('splice', function () {
                self[index] = value;
                notifier.notify({ type: 'add', name: index});
                Object.defineProperty(self, '_length', {
                    value : index + 1,
                    enumerable: false,
                    configurable: true,
                    writable: true
                });
                notifier.notify({ type: 'update', name: 'length', oldValue: len });

                return {
                    index : len,
                    removed : [],
                    addedCount: self.length - len
                };
            });
        }
        else if (!sameValue(value, this[index])) {
            var oldValue = this[index];
            this[index] = value;
            notifier.notify({ type: 'update', name: index, oldValue: oldValue });
        }
        return value;
    };

    /**
     * delete the value at the specified index.
     * @param {number} index
     * @return {boolean}
     */
    List.prototype.delete = function del(index) {
        index = isPositiveFiniteInteger(index, 'Invalid index : $');
        if (this.hasOwnProperty(index)) {
            var oldValue = this[index];
            if (delete this[index]) {
                var notifier = Object.getNotifier(this);
                notifier.notify({ type: 'delete', name: index, oldValue: oldValue });
                return true;
            }
        }
        return false;
    };

    /**
     * create a new list resulting of the concatenation of all the List and array
     * passed as parameter with the addition of other values passed as parameter
     * @param {...*} args
     * @return {List}
     */
    List.prototype.concat = function concat(args) {
        args = arrMap(arguments, function (item) {
            return (item instanceof List) ?  item.toArray() : item;
        });
        return List.fromArray(Array.prototype.concat.apply(this.toArray(), args));
    };

    /**
     * Joins all elements of a List into a string.
     * @param {string} [separator]
     * @return {string}
     */
    List.prototype.join = function join(separator) {
        return this.toArray().join(separator);
    };


    /**
     * Removes the last element from a List and returns that element.
     * @return {*}
     */
    List.prototype.pop = function pop() {
        if (Object(this) !== this) {
            throw new TypeError('this mus be an object given : ' + this);
        }
        var len = isPositiveFiniteInteger(this.length, 'this must have a finite integer property \'length\', given : $');
        if (len === 0) {
            return void(0);
        } else {
            var newLen = len - 1,
                element = this[newLen],
                notifier =  Object.getNotifier(this),
                self = this;
            notifier.performChange('splice', function () {
                delete self[newLen];
                notifier.notify({ type: 'delete', name: newLen, oldValue: element });
                Object.defineProperty(self, '_length', {
                    value : newLen,
                    enumerable: false,
                    configurable: true,
                    writable: true
                });
                notifier.notify({ type: 'update', name: 'length', oldValue: len });

                return {
                    index : newLen,
                    removed : [element],
                    addedCount: 0
                };
            });


            return element;
        }
    };

    /**
     * Mutates a List by appending the given elements and returning the new length of the array.
     * @param {...*} items
     * @return {number}
     */
    List.prototype.push = function push() {
        if (arguments.length > 0) {
            var argumentsLength = arguments.length,
                elements = arguments,
                len = this.length,
                notifier = Object.getNotifier(this),
                self = this,
                i, index;
            notifier.performChange('splice', function () {
                for (i = 0; i < argumentsLength; i++) {
                    index =  len + i;
                    // avoid the usage of the set function and manually
                    // set the value and notify the changes to avoid the notification of
                    // multiple length modification
                    self[index] = elements[i];
                    notifier.notify({
                        type : 'add',
                        name : index
                    });
                }
                Object.defineProperty(self, '_length', {
                    value : len + argumentsLength,
                    enumerable: false,
                    configurable: true,
                    writable: true
                });
                notifier.notify({ type: 'update', name: 'length', oldValue: len });
                return {
                    index : len,
                    removed : [],
                    addedCount: argumentsLength
                };
            });
        }
        return this.length;
    };

    /**
     * Reverses a List in place.  The first List element becomes the last and the last becomes the first.
     * @return {List}
     */
    List.prototype.reverse = function reverse() {
        var copy = this.toArray(),
            arr = copy.slice().reverse();

        for (var i = 0, l = arr.length; i < l; i++) {
            this.set(i, arr[i]);
        }

        return this;
    };

    /**
     * Removes the first element from a List and returns that element. This method changes the length of the List.
     * @return {*}
     */
    List.prototype.shift = function () {
        if (this.length === 0) {
            return void(0);
        }

        var arr = this.toArray(),
            element = arr.shift(),
            notifier = Object.getNotifier(this),
            self = this, len = this.length;
        notifier.performChange('splice', function () {
            for (var i = 0, l = arr.length; i < l; i++) {
                self.set(i, arr[i]);
            }
            self.delete(len - 1);

            Object.defineProperty(self, '_length', {
                value : len - 1,
                enumerable: false,
                configurable: true,
                writable: true
            });
            notifier.notify({ type: 'update', name: 'length', oldValue: len });

            return {
                index : 0,
                removed : [element],
                addedCount: 0
            };
        });


        return element;
    };

    /**
     * Returns a shallow copy of a portion of an List.
     * @param {number} [start]
     * @param {number} [end]
     * @return {List}
     */
    List.prototype.slice = function (start, end) {
        return List.fromArray(this.toArray().slice(start, end));
    };

    /**
     * Sorts the elements of a List in place and returns the List.
     * @param {function} [compareFn]
     * @return {List}
     */
    List.prototype.sort = function (compareFn) {
        var copy = this.toArray(),
            arr = copy.slice().sort(compareFn);
        for (var i = 0, l = arr.length; i < l; i++) {
            this.set(i, arr[i]);
        }
        return this;
    };

    /**
     * Changes the content of a List, adding new elements while removing old elements.
     * @return {List}
     */
    List.prototype.splice = function () {
        var returnValue = [],
            argumentsLength = arguments.length;

        if (argumentsLength > 0) {
            var arr = this.toArray(),
                notifier = Object.getNotifier(this),
                len = this.length,
                self = this,
                index = arguments[0],
                i, l;

            returnValue = Array.prototype.splice.apply(arr, arguments);
            notifier.performChange('splice', function () {
                for (i = 0, l = arr.length; i < l; i++) {
                    var oldValue = self[i];
                    if (!sameValue(oldValue, arr[i])) {
                        self[i] = arr[i];
                        notifier.notify(
                            i >= len ?
                                {type : 'add', name : i}:
                                {type : 'update', name : i, oldValue : oldValue}
                        );
                    }
                }


                if (len !== arr.length) {
                    if (len > arr.length) {
                        //delete values if the length have been decreased
                        for (i = arr.length; i < len; i++) {
                            self.delete(i);
                        }
                    }

                    Object.defineProperty(self, '_length', {
                        value : arr.length,
                        enumerable: false,
                        configurable: true,
                        writable: true
                    });
                    notifier.notify({ type: 'update', name: 'length', oldValue: len });
                }
                return {
                    index : index,
                    removed : returnValue,
                    addedCount: argumentsLength >= 2 ? argumentsLength - 2 : 0
                };
            });

        }
        return List.fromArray(returnValue);
    };

    /**
     * Adds one or more elements to the beginning of a List and returns the new length of the List.
     * @return {number}
     */
    List.prototype.unshift = function () {
        var argumentsLength  = arguments.length;
        if (argumentsLength > 0) {
            var arr = this.toArray(),
                notifier = Object.getNotifier(this),
                len = this.length,
                self = this;

            Array.prototype.unshift.apply(arr, arguments);
            notifier.performChange('splice', function () {
                for (var i = 0, l = arr.length; i < l; i++)  {
                    var oldValue = self[i];
                    if (!sameValue(oldValue, arr[i])) {
                        // avoid the usage of the set function and manually
                        // set the value and notify the changes to avoid the notification of
                        // multiple length modification
                        self[i] = arr[i];
                        notifier.notify(
                            i >= len ?
                                {type : 'add', name : i}:
                                {type : 'update', name : i, oldValue : oldValue}
                        );
                    }
                }

                if (len !== arr.length) {
                    if (len > arr.length) {
                        //delete values if the length have been decreased
                        for (i = arr.length; i < len; i++) {
                            self.delete(i);
                        }
                    }
                    Object.defineProperty(self, '_length', {
                        value : arr.length,
                        enumerable: false,
                        configurable: true,
                        writable: true
                    });
                    notifier.notify({ type: 'update', name: 'length', oldValue: len });
                }

                return {
                    index : 0,
                    removed : [],
                    addedCount: argumentsLength
                };
            });

        }
        return this.length;
    };

    /**
     * Apply a function against an accumulator and each value of the List (from left-to-right) as to reduce it to a single value.
     * @param {function} callback
     * @param {Object} [initialValue]
     * @return {Object}
     */
    List.prototype.reduce =  Array.prototype.reduce;

    /**
     * Apply a function simultaneously against two values of the array (from right-to-left) as to reduce it to a single value.
     * @param {function} callback
     * @param {Object} [initialValue]
     * @return {Object}
     */
    List.prototype.reduceRight =  Array.prototype.reduceRight;

    /**
     * Returns the first index at which a given element can be found in the List, or -1 if it is not present.
     * @param {Object} searchElement
     * @param {number} [fromIndex]
     * @return {number}
     */
    List.prototype.indexOf =  Array.prototype.indexOf;

    /**
     * Returns the last index at which a given element can be found in the List, or -1 if it is not present. The List is searched backwards, starting at fromIndex.
     * @param {Object} searchElement
     * @param {number} [fromIndex]
     * @return {number}
     */
    List.prototype.lastIndexOf = Array.prototype.lastIndexOf;

    /**
     * Tests whether all elements in the List pass the test implemented by the provided function.
     * @param {function} callback
     * @param {Object} [thisObject]
     * @return {boolean}
     */
    List.prototype.every = Array.prototype.every;

    /**
     * Creates a new List with all elements that pass the test implemented by the provided function
     * @param {function} callback
     * @param {Object} [thisObject]
     * @return {List}
     */
    List.prototype.filter = function (callback, thisObject) {
        return List.fromArray(this.toArray().filter(callback, thisObject));
    };

    /**
     * Executes a provided function once per List element.
     * @param {function} callback
     * @param {Object} [thisObject]
     * @return {void}
     */
    List.prototype.forEach = Array.prototype.forEach;

    /**
     * Creates a new List with the results of calling a provided function on every element in this List.
     * @param {function} callback
     * @param {Object} [thisObject]
     * @return {List}
     */
    List.prototype.map = function (callback, thisObject) {
        return List.fromArray(this.toArray().map(callback, thisObject));
    };

    /**
     * Tests whether some element in the List passes the test implemented by the provided function.
     * @param {function} callback
     * @param {Object} [thisObject]
     * @return {boolean}
     */
    List.prototype.some = Array.prototype.some;

    ObserveUtils.List = List;

})(this);
},{}],5:[function(require,module,exports){
'use strict';

module.exports = require('./lib/core.js')
require('./lib/done.js')
require('./lib/es6-extensions.js')
require('./lib/node-extensions.js')
},{"./lib/core.js":6,"./lib/done.js":7,"./lib/es6-extensions.js":8,"./lib/node-extensions.js":9}],6:[function(require,module,exports){
'use strict';

var asap = require('asap')

module.exports = Promise;
function Promise(fn) {
  if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new')
  if (typeof fn !== 'function') throw new TypeError('not a function')
  var state = null
  var value = null
  var deferreds = []
  var self = this

  this.then = function(onFulfilled, onRejected) {
    return new self.constructor(function(resolve, reject) {
      handle(new Handler(onFulfilled, onRejected, resolve, reject))
    })
  }

  function handle(deferred) {
    if (state === null) {
      deferreds.push(deferred)
      return
    }
    asap(function() {
      var cb = state ? deferred.onFulfilled : deferred.onRejected
      if (cb === null) {
        (state ? deferred.resolve : deferred.reject)(value)
        return
      }
      var ret
      try {
        ret = cb(value)
      }
      catch (e) {
        deferred.reject(e)
        return
      }
      deferred.resolve(ret)
    })
  }

  function resolve(newValue) {
    try { //Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
      if (newValue === self) throw new TypeError('A promise cannot be resolved with itself.')
      if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
        var then = newValue.then
        if (typeof then === 'function') {
          doResolve(then.bind(newValue), resolve, reject)
          return
        }
      }
      state = true
      value = newValue
      finale()
    } catch (e) { reject(e) }
  }

  function reject(newValue) {
    state = false
    value = newValue
    finale()
  }

  function finale() {
    for (var i = 0, len = deferreds.length; i < len; i++)
      handle(deferreds[i])
    deferreds = null
  }

  doResolve(fn, resolve, reject)
}


function Handler(onFulfilled, onRejected, resolve, reject){
  this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null
  this.onRejected = typeof onRejected === 'function' ? onRejected : null
  this.resolve = resolve
  this.reject = reject
}

/**
 * Take a potentially misbehaving resolver function and make sure
 * onFulfilled and onRejected are only called once.
 *
 * Makes no guarantees about asynchrony.
 */
function doResolve(fn, onFulfilled, onRejected) {
  var done = false;
  try {
    fn(function (value) {
      if (done) return
      done = true
      onFulfilled(value)
    }, function (reason) {
      if (done) return
      done = true
      onRejected(reason)
    })
  } catch (ex) {
    if (done) return
    done = true
    onRejected(ex)
  }
}

},{"asap":10}],7:[function(require,module,exports){
'use strict';

var Promise = require('./core.js')
var asap = require('asap')

module.exports = Promise
Promise.prototype.done = function (onFulfilled, onRejected) {
  var self = arguments.length ? this.then.apply(this, arguments) : this
  self.then(null, function (err) {
    asap(function () {
      throw err
    })
  })
}
},{"./core.js":6,"asap":10}],8:[function(require,module,exports){
'use strict';

//This file contains the ES6 extensions to the core Promises/A+ API

var Promise = require('./core.js')
var asap = require('asap')

module.exports = Promise

/* Static Functions */

function ValuePromise(value) {
  this.then = function (onFulfilled) {
    if (typeof onFulfilled !== 'function') return this
    return new Promise(function (resolve, reject) {
      asap(function () {
        try {
          resolve(onFulfilled(value))
        } catch (ex) {
          reject(ex);
        }
      })
    })
  }
}
ValuePromise.prototype = Promise.prototype

var TRUE = new ValuePromise(true)
var FALSE = new ValuePromise(false)
var NULL = new ValuePromise(null)
var UNDEFINED = new ValuePromise(undefined)
var ZERO = new ValuePromise(0)
var EMPTYSTRING = new ValuePromise('')

Promise.resolve = function (value) {
  if (value instanceof Promise) return value

  if (value === null) return NULL
  if (value === undefined) return UNDEFINED
  if (value === true) return TRUE
  if (value === false) return FALSE
  if (value === 0) return ZERO
  if (value === '') return EMPTYSTRING

  if (typeof value === 'object' || typeof value === 'function') {
    try {
      var then = value.then
      if (typeof then === 'function') {
        return new Promise(then.bind(value))
      }
    } catch (ex) {
      return new Promise(function (resolve, reject) {
        reject(ex)
      })
    }
  }

  return new ValuePromise(value)
}

Promise.all = function (arr) {
  var args = Array.prototype.slice.call(arr)

  return new Promise(function (resolve, reject) {
    if (args.length === 0) return resolve([])
    var remaining = args.length
    function res(i, val) {
      try {
        if (val && (typeof val === 'object' || typeof val === 'function')) {
          var then = val.then
          if (typeof then === 'function') {
            then.call(val, function (val) { res(i, val) }, reject)
            return
          }
        }
        args[i] = val
        if (--remaining === 0) {
          resolve(args);
        }
      } catch (ex) {
        reject(ex)
      }
    }
    for (var i = 0; i < args.length; i++) {
      res(i, args[i])
    }
  })
}

Promise.reject = function (value) {
  return new Promise(function (resolve, reject) { 
    reject(value);
  });
}

Promise.race = function (values) {
  return new Promise(function (resolve, reject) { 
    values.forEach(function(value){
      Promise.resolve(value).then(resolve, reject);
    })
  });
}

/* Prototype Methods */

Promise.prototype['catch'] = function (onRejected) {
  return this.then(null, onRejected);
}

},{"./core.js":6,"asap":10}],9:[function(require,module,exports){
'use strict';

//This file contains then/promise specific extensions that are only useful for node.js interop

var Promise = require('./core.js')
var asap = require('asap')

module.exports = Promise

/* Static Functions */

Promise.denodeify = function (fn, argumentCount) {
  argumentCount = argumentCount || Infinity
  return function () {
    var self = this
    var args = Array.prototype.slice.call(arguments)
    return new Promise(function (resolve, reject) {
      while (args.length && args.length > argumentCount) {
        args.pop()
      }
      args.push(function (err, res) {
        if (err) reject(err)
        else resolve(res)
      })
      fn.apply(self, args)
    })
  }
}
Promise.nodeify = function (fn) {
  return function () {
    var args = Array.prototype.slice.call(arguments)
    var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null
    var ctx = this
    try {
      return fn.apply(this, arguments).nodeify(callback, ctx)
    } catch (ex) {
      if (callback === null || typeof callback == 'undefined') {
        return new Promise(function (resolve, reject) { reject(ex) })
      } else {
        asap(function () {
          callback.call(ctx, ex)
        })
      }
    }
  }
}

Promise.prototype.nodeify = function (callback, ctx) {
  if (typeof callback != 'function') return this

  this.then(function (value) {
    asap(function () {
      callback.call(ctx, null, value)
    })
  }, function (err) {
    asap(function () {
      callback.call(ctx, err)
    })
  })
}

},{"./core.js":6,"asap":10}],10:[function(require,module,exports){
(function (process){

// Use the fastest possible means to execute a task in a future turn
// of the event loop.

// linked list of tasks (single, with head node)
var head = {task: void 0, next: null};
var tail = head;
var flushing = false;
var requestFlush = void 0;
var isNodeJS = false;

function flush() {
    /* jshint loopfunc: true */

    while (head.next) {
        head = head.next;
        var task = head.task;
        head.task = void 0;
        var domain = head.domain;

        if (domain) {
            head.domain = void 0;
            domain.enter();
        }

        try {
            task();

        } catch (e) {
            if (isNodeJS) {
                // In node, uncaught exceptions are considered fatal errors.
                // Re-throw them synchronously to interrupt flushing!

                // Ensure continuation if the uncaught exception is suppressed
                // listening "uncaughtException" events (as domains does).
                // Continue in next event to avoid tick recursion.
                if (domain) {
                    domain.exit();
                }
                setTimeout(flush, 0);
                if (domain) {
                    domain.enter();
                }

                throw e;

            } else {
                // In browsers, uncaught exceptions are not fatal.
                // Re-throw them asynchronously to avoid slow-downs.
                setTimeout(function() {
                   throw e;
                }, 0);
            }
        }

        if (domain) {
            domain.exit();
        }
    }

    flushing = false;
}

if (typeof process !== "undefined" && process.nextTick) {
    // Node.js before 0.9. Note that some fake-Node environments, like the
    // Mocha test runner, introduce a `process` global without a `nextTick`.
    isNodeJS = true;

    requestFlush = function () {
        process.nextTick(flush);
    };

} else if (typeof setImmediate === "function") {
    // In IE10, Node.js 0.9+, or https://github.com/NobleJS/setImmediate
    if (typeof window !== "undefined") {
        requestFlush = setImmediate.bind(window, flush);
    } else {
        requestFlush = function () {
            setImmediate(flush);
        };
    }

} else if (typeof MessageChannel !== "undefined") {
    // modern browsers
    // http://www.nonblocking.io/2011/06/windownexttick.html
    var channel = new MessageChannel();
    channel.port1.onmessage = flush;
    requestFlush = function () {
        channel.port2.postMessage(0);
    };

} else {
    // old browsers
    requestFlush = function () {
        setTimeout(flush, 0);
    };
}

function asap(task) {
    tail = tail.next = {
        task: task,
        domain: isNodeJS && process.domain,
        next: null
    };

    if (!flushing) {
        flushing = true;
        requestFlush();
    }
};

module.exports = asap;


}).call(this,require('_process'))
},{"_process":2}],11:[function(require,module,exports){
(function (process){
(function (global, undefined) {
    "use strict";

    if (global.setImmediate) {
        return;
    }

    var nextHandle = 1; // Spec says greater than zero
    var tasksByHandle = {};
    var currentlyRunningATask = false;
    var doc = global.document;
    var setImmediate;

    function addFromSetImmediateArguments(args) {
        tasksByHandle[nextHandle] = partiallyApplied.apply(undefined, args);
        return nextHandle++;
    }

    // This function accepts the same arguments as setImmediate, but
    // returns a function that requires no arguments.
    function partiallyApplied(handler) {
        var args = [].slice.call(arguments, 1);
        return function() {
            if (typeof handler === "function") {
                handler.apply(undefined, args);
            } else {
                (new Function("" + handler))();
            }
        };
    }

    function runIfPresent(handle) {
        // From the spec: "Wait until any invocations of this algorithm started before this one have completed."
        // So if we're currently running a task, we'll need to delay this invocation.
        if (currentlyRunningATask) {
            // Delay by doing a setTimeout. setImmediate was tried instead, but in Firefox 7 it generated a
            // "too much recursion" error.
            setTimeout(partiallyApplied(runIfPresent, handle), 0);
        } else {
            var task = tasksByHandle[handle];
            if (task) {
                currentlyRunningATask = true;
                try {
                    task();
                } finally {
                    clearImmediate(handle);
                    currentlyRunningATask = false;
                }
            }
        }
    }

    function clearImmediate(handle) {
        delete tasksByHandle[handle];
    }

    function installNextTickImplementation() {
        setImmediate = function() {
            var handle = addFromSetImmediateArguments(arguments);
            process.nextTick(partiallyApplied(runIfPresent, handle));
            return handle;
        };
    }

    function canUsePostMessage() {
        // The test against `importScripts` prevents this implementation from being installed inside a web worker,
        // where `global.postMessage` means something completely different and can't be used for this purpose.
        if (global.postMessage && !global.importScripts) {
            var postMessageIsAsynchronous = true;
            var oldOnMessage = global.onmessage;
            global.onmessage = function() {
                postMessageIsAsynchronous = false;
            };
            global.postMessage("", "*");
            global.onmessage = oldOnMessage;
            return postMessageIsAsynchronous;
        }
    }

    function installPostMessageImplementation() {
        // Installs an event handler on `global` for the `message` event: see
        // * https://developer.mozilla.org/en/DOM/window.postMessage
        // * http://www.whatwg.org/specs/web-apps/current-work/multipage/comms.html#crossDocumentMessages

        var messagePrefix = "setImmediate$" + Math.random() + "$";
        var onGlobalMessage = function(event) {
            if (event.source === global &&
                typeof event.data === "string" &&
                event.data.indexOf(messagePrefix) === 0) {
                runIfPresent(+event.data.slice(messagePrefix.length));
            }
        };

        if (global.addEventListener) {
            global.addEventListener("message", onGlobalMessage, false);
        } else {
            global.attachEvent("onmessage", onGlobalMessage);
        }

        setImmediate = function() {
            var handle = addFromSetImmediateArguments(arguments);
            global.postMessage(messagePrefix + handle, "*");
            return handle;
        };
    }

    function installMessageChannelImplementation() {
        var channel = new MessageChannel();
        channel.port1.onmessage = function(event) {
            var handle = event.data;
            runIfPresent(handle);
        };

        setImmediate = function() {
            var handle = addFromSetImmediateArguments(arguments);
            channel.port2.postMessage(handle);
            return handle;
        };
    }

    function installReadyStateChangeImplementation() {
        var html = doc.documentElement;
        setImmediate = function() {
            var handle = addFromSetImmediateArguments(arguments);
            // Create a <script> element; its readystatechange event will be fired asynchronously once it is inserted
            // into the document. Do so, thus queuing up the task. Remember to clean up once it's been called.
            var script = doc.createElement("script");
            script.onreadystatechange = function () {
                runIfPresent(handle);
                script.onreadystatechange = null;
                html.removeChild(script);
                script = null;
            };
            html.appendChild(script);
            return handle;
        };
    }

    function installSetTimeoutImplementation() {
        setImmediate = function() {
            var handle = addFromSetImmediateArguments(arguments);
            setTimeout(partiallyApplied(runIfPresent, handle), 0);
            return handle;
        };
    }

    // If supported, we should attach to the prototype of global, since that is where setTimeout et al. live.
    var attachTo = Object.getPrototypeOf && Object.getPrototypeOf(global);
    attachTo = attachTo && attachTo.setTimeout ? attachTo : global;

    // Don't get fooled by e.g. browserify environments.
    if ({}.toString.call(global.process) === "[object process]") {
        // For Node.js before 0.9
        installNextTickImplementation();

    } else if (canUsePostMessage()) {
        // For non-IE10 modern browsers
        installPostMessageImplementation();

    } else if (global.MessageChannel) {
        // For web workers, where supported
        installMessageChannelImplementation();

    } else if (doc && "onreadystatechange" in doc.createElement("script")) {
        // For IE 6–8
        installReadyStateChangeImplementation();

    } else {
        // For older browsers
        installSetTimeoutImplementation();
    }

    attachTo.setImmediate = setImmediate;
    attachTo.clearImmediate = clearImmediate;
}(new Function("return this")()));

}).call(this,require('_process'))
},{"_process":2}],12:[function(require,module,exports){
/**
 * microbe.js
 *
 * @author  Mouse Braun         <mouse@sociomantic.com>
 * @author  Nicolas Brugneaux   <nicolas.brugneaux@sociomantic.com>
 *
 * @package Microbe
 */
'use strict';

var Arrays      = require( '../utils/array' );
var Strings     = require( '../utils/string' );
var Types       = require( '../utils/types' );

var slice       = Arrays.slice;
var splice      = Arrays.splice;
var push        = Arrays.push;
var forEach     = Arrays.forEach;
var map         = Arrays.map;
var indexOf     = Arrays.indexOf;
var toString    = Strings.toString;
var _type       = '[object Microbe]';

/**
 * µ constructor
 *
 * builds the µ object
 *
 * @return µ
 */
var Microbe = function( selector, scope, elements )
{
    return new Microbe.core.__init__( selector, scope, elements );
};

function isIterable( obj )
{
    var length  = obj.length;
    var type    = Microbe.type( obj );

    if ( type === 'function' || obj === window )
    {
        return false;
    }

    if ( obj.nodeType === 1 && length )
    {
        return true;
    }

    return type === 'array' || length === 0 ||
        ( typeof length === 'number' && length > 0 && ( length - 1 ) in obj );
}


Microbe.core = Microbe.prototype =
{
    version :       '0.2.2',

    constructor :   Microbe,

    selector :      '',

    length :        0,


    /**
     * Add Class
     *
     * Method adds the given class from the current object or the given element.
     *
     * @param   {str}               _class              class to add
     *
     * @return  Microbe
    */
    addClass : (function()
    {
        var _addClass = function( _class, _el )
        {
            var i, len;
            for ( i = 0, len = _class.length; i < len; i++ )
            {
                _el.classList.add( _class[i] );
            }

            _el.data                = _el.data || {};
            _el.data.class          = _el.data.class || {};
            _el.data.class.class    = _el.className;
        };

        return function( _class )
        {
            if ( typeof _class === 'string' )
            {
                _class = [ _class ];
            }

            var i, len;
            for ( i = 0, len = this.length; i < len; i++ )
            {
                _addClass( _class, this[i] );
            }

            return this;
        };
    }()),



    /**
     * Append Element
     *
     * @param   {element}           _ele                element to append
     *
     * @return  {microbe}           this
     */
    append : (function()
    {
        var _append = function( _parentEl, _elm )
        {
            _parentEl.appendChild( _elm );
        };

        return function( _el )
        {
            if ( !_el.length )
            {
                _el = [ _el ];
            }

            var i, j, leni, lenj;
            for ( i = 0, leni = this.length; i < leni; i++ )
            {
                for ( j = 0, lenj = _el.length; j < lenj; j++ )
                {
                    if ( i !== 0 )
                    {
                        _append( this[ i ], _el[ j ].cloneNode(true) );
                    }
                    else
                    {
                        _append( this[ i ], _el[ j ] );
                    }
                }
            }

            return this;
        };
    }()),


     /**
     * Alter/Get Attribute
     *
     * Changes the attribute by writing the given property and value to the
     * supplied elements. (properties should be supplied in javascript format).
     * If the value is omitted, simply returns the current attribute value  of the
     * element.
     *
     * @param   _attribute  string           JS formatted CSS property
     * @param   _value      string           CSS value (optional)
     *
     * @return  mixed ( Microbe or string or array of strings)
    */
    attr : function ( _attribute, _value )
    {
        var _setAttr;
        var _getAttr;
        var _removeAttr;

        _setAttr = function( _elm )
        {
            if ( _value === null )
            {
                _removeAttr( _elm );
            }
            else
            {
                if ( !_elm.getAttribute )
                {
                    _elm[ _attribute ] = _value;
                }
                else
                {
                    _elm.setAttribute( _attribute, _value );
                }

                _elm.data                    = _elm.data || {};
                _elm.data.attr               = _elm.data.attr || {};
                _elm.data.attr[ _attribute ] = _value;
            }
        };

        _getAttr = function( _elm )
        {
            if ( _elm.getAttribute( _attribute ) === null )
            {
                return _elm[ _attribute ];
            }
            return _elm.getAttribute( _attribute );
        };

        _removeAttr = function( _elm )
        {
            if ( _elm.getAttribute( _attribute ) === null )
            {
                delete _elm[ _attribute ];
            }
            else
            {
                _elm.removeAttribute( _attribute );
            }
        };

        if ( _value !== undefined )
        {
            var i, len;
            for ( i = 0, len = this.length; i < len; i++ )
            {
                _setAttr( this[ i ] );
            }

            return this;
        }

        var j, lenj;
        var attributes = new Array( this.length );
        for ( j = 0, lenj = this.length; j < lenj; j++ )
        {
            attributes[ j ] = _getAttr( this[ j ] );
        }

        if ( attributes.length === 1 )
        {
            return attributes[0];
        }

        return attributes;
    },


     /**
     * Bind Events
     *
     * Methods binds an event to the HTMLElements of the current object or to the
     * given element.
     *
     * @param   _event      string          HTMLEvent
     * @param   _callback   function        callback function
     *
     * @return  Microbe
    */
    bind : function ( _event, _callback )
    {
        var _bind = function( _elm )
        {
            var prop = '_' + _event + '-bound-function';

            _elm.data                    = _elm.data || {};
            _elm.data[ prop ]            = _elm.data[ prop ] || {};
            var _callbackArray           = _elm.data[ prop ][ prop ];

            var i, len, filterFunction = function( val ){ return val !== null; };

            if ( ! _callbackArray )
            {
                _callbackArray = [];
            }

            _elm.addEventListener( _event, _callback );
            _callbackArray.push( _callback );
            _elm.data[ prop ][ prop ]    = _callbackArray;
        };

        var i, len;
        for ( i = 0, len = this.length; i < len; i++ )
        {
            _bind( this[ i ] );
        }

        return this;
    },


    /**
     * Get Children
     *
     * gets an array or all the given element's children
     *
     * @param  {[type]} _el [description]
     * @return {[type]}     [description]
     */
    children : function( _el )
    {
        var _children = function( _elm )
        {
            return _elm.children;
        };

        var i, len, childrenArray = new Array( this.length );

        for ( i = 0, len = this.length; i < len; i++ )
        {
            childrenArray[ i ] = _children( this[ i ] );
        }

        if ( childrenArray.length === 1 )
        {
            return childrenArray[0];
        }

        return childrenArray;
    },


    /**
     * Create Element
     *
     * Method creates a Microbe from an element or a new element of the passed string, and
     * returns the Microbe
     *
     * @param   _el                 HTMLELement         element to create
     *
     * @return  Microbe
    */
    create : function ( _el )
    {
        var selectorRegex   = /(?:[\s]*\.([\w-_\.]*)|#([\w-_]*)|([^#\.<][\w-_]*)|(<[\w-_#\.]*>))/g,
            resultsRegex    = _el.match( selectorRegex ),
            _id, _tag, _class, _selector = '';

        var i, lenI;
        for ( i = 0, lenI = resultsRegex.length; i < lenI; i++ )
        {
            var trigger = resultsRegex[ i ][ 0 ];
            switch ( trigger )
            {
                case '#':
                    _id      = resultsRegex[ i ];
                    break;

                case '.':
                    _class   = resultsRegex[ i ];
                    break;

                default:
                    _tag     = resultsRegex[ i ];
                    break;
            }
        }

        if ( typeof _tag === 'string' )
        {
            _el = document.createElement( _tag );
            _selector = _tag;

            if ( _id )
            {
                _selector += _id;
                _el.id = _id.slice( 1 );
            }

            if ( _class )
            {
                _selector += _class;
                _class = _class.split( '.' );

                for ( i = 1, lenI = _class.length; i < lenI; i++ )
                {
                    _el.classList.add( _class[ i ] );
                }
            }

        }

        return new Microbe( _selector, undefined, _el );
    },


    /**
     * Alter/Get CSS
     *
     * Changes the CSS by writing the given property and value inline to the
     * supplied elements. (properties should be supplied in javascript format).
     * If the value is omitted, simply returns the current css value of the element.
     *
     * @param   _property   string          CSS property
     * @param   _value      string          CSS value (optional)
     *
     * @return  mixed ( Microbe or string or array of strings)
    */
    css : function ( _property, _value )
    {
        var _setCss = function( _elm )
        {
            _elm.data                   = _elm.data || {};
            _elm.data.css               = _elm.data.css || {};
            _elm.data.css[ _property ]  = _value;
            _elm.style[ _property ]     = _elm.data.css[ _property ];
        };

        var _getCss = function( _elm )
        {
            return window.getComputedStyle( _elm ).getPropertyValue( _property );
        };

        if ( _value)
        {
            var i, len;
            for ( i = 0, len = this.length; i < len; i++ )
            {
                _setCss( this[ i ] );
            }

            return this;
        }
        var j, lenj, styles = new Array( this.length );
        for ( j = 0, lenj = this.length; j < lenj; j++ )
        {
            styles[ j ] = _getCss( this[ j ] );
        }
        if ( styles.length === 1 )
        {
            return styles[0];
        }

        return styles;
    },


    /**
     * For each
     *
     * Methods iterates through all the elements an execute the function on each of
     * them
     *
     * @return  Array
    */
    each : function( _callback )
    {
        var i, leni;
        for ( i = 0, leni = this.length; i < leni; i++ )
        {
            _callback( this[ i ], i );
        }
        return this;
    },


    /**
     * Get First Element
     *
     * Methods gets the first HTML Elements of the current object, and wrap it in
     * Microbe for chaining purpose.
     *
     * @return  Microbe
     */
    first : function ()
    {
        if ( this.length === 1 )
        {
            return this;
        }

        return new Microbe( [ this[ 0 ] ] );
    },


    /**
     * Get Parent Index
     *
     * gets the index of the item in it's parentNode's children array
     *
     * @return {array}                       array of indexes
     */
    getParentIndex : function()
    {
        var _getParentIndex = function( _elm )
        {
            return Array.prototype.indexOf.call( _elm.parentNode.children, _elm );
        };

        var i, len, indexes = new Array( this.length );

        for ( i = 0, len = this.length; i < len; i++ )
        {
            indexes[ i ] = _getParentIndex( this[ i ] );
        }

        return indexes;
    },


    /**
     * Has Class
     *
     * Method checks if the current object or the given element has the given class
     *
     * @param   _class      string       class to check
     *
     * @return  Microbe
    */
    hasClass : function( _class )
    {
        var _hasClass = function( _elm )
        {
            return _elm.classList.contains( _class );
        };

        var i, len, results = new Array( this.length );
        for ( i = 0, len = this.length; i < len; i++ )
        {
            results[ i ] = _hasClass( this[ i ] );
        }

        return results;
    },


    /**
     * Alter/Get inner HTML
     *
     * Changes the innerHtml to the supplied string.
     * If the value is omitted, simply returns the current inner html value of the element.
     *
     * @param   _value      string          html value (optional)
     * @param   _el         HTMLELement     element to modify (optional)
     *
     * @return  mixed ( Microbe or string or array of strings)
    */
    html : function ( _value, _el )
    {
        var _getHtml = function( _elm )
        {
            return _elm.innerHTML;
        };

        if ( _value && _value.nodeType === 1 )
        {
           return _getHtml( _value );
        }

        if ( _value || _value === '' )
        {
            var _setHtml = function( _elm )
            {
                _elm.data           = _elm.data || {};
                _elm.data.html      = _elm.data.html || {};
                _elm.data.html.html = _value;
                _elm.innerHTML      = _value;
            };

            if ( _el )
            {
                _setHtml( _el );
                return this;
            }

            var i, len;
            for ( i = 0, len = this.length; i < len; i++ )
            {
                _setHtml( this[ i ] );
            }

            return this;
        }

        var j, lenj, markup = new Array( this.length );
        for ( j = 0, lenj = this.length; j < lenj; j++ )
        {
            markup[ j ] = _getHtml( this[ j ] );
        }

        if ( markup.length === 1 || typeof markup === 'string' )
        {
            return markup[0];
        }
        return markup;
    },


    /**
     * Index of
     *
     *
     *
     * @return {void}
     */
    indexOf : function( _el )
    {
        return this.toArray().indexOf( _el );
    },


    /**
     * Insert After
     *
     * Inserts the given element after each of the elements given (or passed through this).
     * if it is an elemnet it is wrapped in a microbe object.  if it is a string it is created
     *
     * @example µ( '.elementsInDom' ).insertAfter( µElementToInsert )
     *
     * @param  {obj or str}         _elAfter            element to insert
     *
     * @return Microbe
     */
    insertAfter : function( _elAfter )
    {
        var _this = this;

        var _insertAfter = function( _elm )
        {
            var nextIndex;

            nextIndex = _this.getParentIndex( _elm )[0];

            var nextEle   = _elm.parentNode.children[ nextIndex + 1 ];

            for ( var i = 0, lenI = _elAfter.length; i < lenI; i++ )
            {
                if ( nextEle )
                {
                    nextEle.parentNode.insertBefore( _elAfter[ i ].cloneNode( true ), nextEle );
                }
                else
                {
                    _elm.parentNode.appendChild( _elAfter[ i ].cloneNode( true ) );
                }
            }
        };

        if ( typeof _elAfter === 'string' )
        {
            _elAfter = new Microbe( _elAfter );
        }
        else if ( ! _elAfter.length )
        {
            _elAfter = [ _elAfter ];
        }

        var i, len;
        for ( i = 0, len = this.length; i < len; i++ )
        {
            _insertAfter( this[ i ] );
        }

        return this;
    },


    /**
     * Get Last Element
     *
     * Methods gets the last HTML Elements of the current object, and wrap it in
     * Microbe for chaining purpose.
     *
     * @return  {microbe}
     */
    last : function ()
    {
        if ( this.length === 1 )
        {
            return this;
        }

        return new Microbe( [ this[ this.length - 1 ] ] );
    },


    /**
     * map
     *
     * @param  {Function} callback [description]
     *
     * @return {[type]}            [description]
     */
    map : function( callback )
    {
        return map.call( this, callback );
    },


    /**
     * Get Parent
     *
     * sets all elements in µ to their parent nodes
     *
     * @return {[type]}     [description]
     */
    parent : function()
    {
        var _parent = function( _elm )
        {
            return _elm.parentNode;
        };

        var i, len, parentArray = new Array( this.length );

        for ( i = 0, len = this.length; i < len; i++ )
        {
            parentArray[ i ] = _parent( this[ i ] );
        }

        return new Microbe( parentArray );
    },



    /**
     * Push element
     *
     * adds a new element to a microbe
     *
     * @param  {[type]} _el [description]
     *
     * @return {[type]}     [description]
     */
    push : function( _el )
    {
        var length = this.length;

        if ( _el && _el.nodeType === 1 )
        {
            this[ length ] = _el;
            this.length = length + 1;
        }

        return this;
    },


    /**
     * Remove Element
     *
     * removes an element or elements from the dom
     *
     * @param  {[type]} _el [description]
     * @return {[type]}     [description]
     */
    remove : function()
    {
        var _remove = function( _elm )
        {
            return _elm.parentNode.removeChild( _elm );
        };

        var i, len;

        for ( i = 0, len = this.length; i < len; i++ )
        {
            _remove( this[ i ] );
        }

        return this;
    },


    /**
     * Remove Class
     *
     * Method removes the given class from the current object or the given element.
     *
     * @param   {str}               _class              class to remove
     *
     * @return  Microbe
    */
    removeClass : (function()
    {
        var _removeClass = function( _class, _el )
        {
            _el.classList.remove( _class );

            _el.data                = _el.data || {};
            _el.data.class          = _el.data.class || {};
            _el.data.class.class    = _el.className;
        };

        return function( _class )
        {
            var i, len;
            for ( i = 0, len = this.length; i < len; i++ )
            {
                _removeClass( _class, this[ i ] );
            }

            return this;
        };
    }()),


    splice : splice,


    /**
     * Alter/Get inner Text
     *
     * Changes the inner text to the supplied string.
     * If the value is
     * If the value is omitted, simply returns the current inner html value of the element.
     *
     * @param   _value      string          Text value (optional)
     *
     * @return  mixed ( Microbe or string or array of strings)
    */
    text : (function()
    {
        var _setText = function( _value, _el )
        {
            if( document.all )
            {
                _el.innerText = _value;
            }
            else // stupid FF
            {
                _el.textContent = _value;
            }

            _el.data            = _el.data || {};
            _el.data.text       = _el.data.text || {};
            _el.data.text.text  = _value;
        };

        var _getText = function( _el )
        {
            if( document.all )
            {
                return _el.innerText;
            }
            else // stupid FF
            {
                return _el.textContent;
            }
        };
        return function( _value )
        {
            if ( _value )
            {
                var i, len;
                for ( i = 0, len = this.length; i < len; i++ )
                {
                    _setText( _value, this[ i ] );
                }

                return this;
            }

            var j, lenj, arrayText = new Array( this.length );
            for ( j = 0, lenj = this.length; j < lenj; j++ )
            {
                arrayText[ j ] = _getText( this[ j ] );
            }

            if ( arrayText.length === 1 )
            {
                return arrayText[0];
            }

            return arrayText;
        };
    }()),


    /**
     * To array
     *
     * Methods returns all the elements in an array.
     *
     * @return  Array
    */
    toArray : function()
    {
        return Array.prototype.slice.call( this );
    },


    /**
     * Toggle Class
     *
     * Methods calls removeClass or removeClass from the current object or given
     * element.
     *
     * @param   _class      string       class to add
     *
     * @return  Microbe
    */
    toggleClass : (function()
    {
        var _toggleClass = function( _class, _el )
        {
            if ( _el.classList.contains( _class ) )
            {
                _el.classList.remove( _class );
            }
            else
            {
                _el.classList.add( _class );
            }

            _el.data                = _el.data || {};
            _el.data.class          = _el.data.class || {};
            _el.data.class.class    = _el.className;
        };
        return function( _class )
        {
            var i, len;
            for ( i = 0, len = this.length; i < len; i++ )
            {
                _toggleClass( _class, this[ i ] );
            }

            return this;
        };
    }()),


    /**
     * To String
     *
     * Methods returns the type of Microbe.
     *
     * @return  string
    */
    toString : function()
    {
        return _type;
    },


     /**
     * Unbind Events
     *
     * unbinds an/all events.
     *
     * @param   _event      string          HTMLEvent
     * @param   _callback   function        callback function
     * @param   _el         HTMLELement     element to modify (optional)
     *
     * @return  Microbe
    */
    unbind : function( _event, _callback )
    {
        var i, len, filterFunction = function( val ){ return val !== null; };
        for ( i = 0, len = this.length; i < len; i++ )
        {
            var _elm = this[ i ];
            var prop = '_' + _event + '-bound-function';
            if ( ! _callback && _elm.data && _elm.data[ prop ] &&
                    _elm.data[ prop ][ prop ] )
            {
                _callback = _elm.data[ prop ][ prop ];
            }

            if ( _callback )
            {
                if ( Object.prototype.toString.call( _callback ) !== '[Object Array]' )
                {
                    _callback = [ _callback ];
                }

                for ( var j = 0, lenJ = _callback.length; j < lenJ; j++ )
                {
                    _elm.removeEventListener( _event, _callback[ j ] );
                    _callback[ j ] = null;
                }
                _callback.filter( filterFunction );


                _elm.data                   = _elm.data || {};
                _elm.data[ prop ]           = _elm.data[ prop ] || {};
                _elm.data[ prop ][ prop ]   = _callback;
            }

        }

        return this;
    }
};

Microbe.extend = Microbe.core.extend = function()
{
    var args    = slice.call( arguments );
    var index   = 0;
    var length  = args.length;
    var deep    = false;
    var isArray;
    var target;
    var options;
    var src;
    var copy;
    var clone;

    if ( args[index] === true )
    {
        deep    = true;
        index   += 1;
    }

    target = Microbe.isObject( args[index] ) ? args[index] : {};

    for ( ; index < length; index++ )
    {
        if ( ( options = args[index] ) !== null )
        {
            for ( var name in options )
            {
                isArray = false;
                src     = target[name];
                copy    = options[name];

                if ( target === copy || copy === undefined )
                {
                    continue;
                }

                if ( deep && copy && Microbe.isObject( copy ) )
                {
                    if ( Microbe.isArray( copy ) )
                    {
                        clone = src && Microbe.isArray( src ) ? src : [];
                    }
                    else
                    {
                        clone = src && Microbe.isObject( src ) ? src : {};
                    }

                    target[name] = Microbe.extend( deep, clone, copy );
                }

                target[name] = copy;
            }
        }
    }

    return target;
};


Microbe.identity = function( value ) { return value; };


Microbe.isFunction = function( obj )
{
    return Microbe.type(obj) === "function";
};


Microbe.isArray = Array.isArray;


Microbe.isWindow = function( obj )
{
    return obj !== null && obj === obj.window;
};


Microbe.isObject = function( obj )
{
    if ( Microbe.type( obj ) !== "object" || obj.nodeType || Microbe.isWindow( obj ) )
    {
        return false;
    }

    return true;
};


Microbe.isEmpty = function( obj )
{
    var name;
    for ( name in obj )
    {
        return false;
    }

    return true;
};


Microbe.merge = Microbe.core.merge  = function( first, second )
{
    var i = first.length;

    for ( var j = 0, length = second.length; j < length; j++ )
    {
        first[ i++ ] = second[ j ];
    }

    first.length = i;

    return first;
};


Microbe.noop = function() {};

Microbe.toString = Microbe.core.toString = function()
{
    return _type;
};

Microbe.type = function( obj )
{
    if ( obj === null )
    {
        return obj + '';
    }

    return typeof obj === 'object' ?
        Types[ obj.toString() ] || 'object' :
        typeof obj;
};

module.exports = Microbe;

},{"../utils/array":18,"../utils/string":19,"../utils/types":20}],13:[function(require,module,exports){
module.exports = function( Microbe )
{
    var trigger, _shortSelector, selectorRegex   = /(?:[\s]*\.([\w-_\.]*)|#([\w-_]*)|([^#\.<][\w-_]*)|(<[\w-_#\.]*>))/g;

    /**
     * Build
     *
     * builds and returns the final microbe
     *
     * @param  {arr}                _elements           array of elements
     * @param  {str}                _selector           selector
     *
     * @return {[type]}           [description]
     */
    function _build( _elements, _selector )
    {
        var i = 0, lenI = _elements.length;

        for ( ; i < lenI; i++ )
        {
            this[ i ] = _elements[ i ];
        }

        this.selector    = _selector;
        this.length      = i;

        return this;
    }


    /**
     * Contains
     *
     * checks if a given element is a child of _scope
     *
     * @param  {[type]} _el        [description]
     * @param  {[type]} _scope     [description]
     *
     * @return {[type]}            [description]
     */
    function _contains( _el, _scope )
    {
        var parent = _el.parentNode;

        while ( parent !== document && parent !== _scope )
        {
            parent = parent.parentNode || _scope.parentNode;
        }

        if ( parent === document )
        {
            return false;
        }

        return true;
    }


    /**
     * Get Selector
     *
     * returns the css selector from an element
     *
     * @param  {DOM Element}        _el         DOM element
     *
     * @return {string}                         css selector
     */
    function _getSelector( _el )
    {
        var getSelectorString = function( _elm )
        {
            if ( _elm && _elm.tagName )
            {
                var tag = _elm.tagName.toLowerCase(),
                id      = ( _elm.id ) ? '#' + _elm.id : '',
                clss    = ( _elm.className.length > 0 ) ? '.' + _elm.className : '';
                clss    = clss.replace( ' ', '.' );

                return tag + id + clss;
            }

            // document or window
            return '';
        };

        if ( _el.nodeType === 1 )
        {
            return getSelectorString( _el );
        }
        else
        {
            var _selector, selectors = [];

            for ( var i = 0, lenI = _el.length; i < lenI; i++ )
            {
                _selector = getSelectorString( _el[ i ] );

                if ( selectors.indexOf( _selector ) === -1 )
                {
                    selectors.push( _selector );
                }
            }

            return selectors.join( ', ' );
        }
    }


    /**
     * Class Microbe
     *
     * Constructor.
     * Either selects or creates an HTML element and wraps in into an Microbe instance.
     * Usage:   µ('div#test')   ---> selection
     *          µ('<div#test>') ---> creation
     *
     * @param   _selector   string or HTMLElement   HTML selector
     * @param   _scope      HTMLElement             scope to look inside
     * @param   _elements   HTMLElement(s)          elements to fill Microbe with (optional)
     *
     * @return  Microbe
    */
    Microbe.core.__init__ =  function( _selector, _scope, _elements )
    {
        _selector = _selector || '';

        if ( _selector.nodeType === 1 || Object.prototype.toString.call( _selector ) === '[object Array]' ||
            _selector === window || _selector === document )
        {
            _elements = _selector;
            _selector = _getSelector( _elements );
        }

        _scope = _scope === undefined ?  document : _scope;
        var scopeNodeType   = _scope.nodeType,
            nodeType        = ( _selector ) ? _selector.nodeType || typeof _selector : null;

        if ( !( this instanceof Microbe.core.__init__ ) )
        {
            return new Microbe.core.__init__( _selector, _scope, _elements );
        }

        if ( _elements )
        {
            if ( Object.prototype.toString.call( _elements ) === '[object Array]' )
            {
                return _build.call( this, _elements, _selector );
            }
            else
            {
                return _build.call( this, [ _elements ], _selector );
            }
        }
        else
        {
            if ( ( !_selector || typeof _selector !== 'string' ) ||
                ( scopeNodeType !== 1 && scopeNodeType !== 9 ) )
            {
                return _build.call( this, [], _selector );
            }

            var resultsRegex = _selector.match( selectorRegex );

            if ( resultsRegex && resultsRegex.length === 1 )
            {
                trigger = resultsRegex[0][0];
                _shortSelector = _selector.slice( 1 );

                if ( trigger === '<' )
                {
                    return Microbe.core.create( _selector.substring( 1, _selector.length - 1 ) );
                }
                else if ( trigger === '.' )
                {
                    var _classesCount   = ( _selector || '' ).slice( 1 ).split( '.' ).length;

                    if ( _classesCount === 1 )
                    {
                        return _build.call( this, _scope.getElementsByClassName( _shortSelector ), _selector );
                    }
                }
                else if ( trigger === '#' )
                {
                    var _id = document.getElementById( _shortSelector );

                    if ( ! _id )
                    {
                        return _build.call( this, [], _selector );
                    }

                    if ( scopeNodeType === 9 )
                    {
                        if ( _id.parentNode && ( _id.id === _selector ) )
                        {
                            return _build.call( this, [ _id ], _selector );
                        }
                    }
                    else // scope not document
                    {
                        if ( _scope.ownerDocument && _contains( _id, _scope ) )
                        {
                            return _build.call( this, [ _id ], _selector );
                        }
                    }
                }
                else // if ( _tagSelector ) // && ! _idSelector && ! _classSelector )
                {
                    return _build.call( this, _scope.getElementsByTagName( _selector ), _selector );
                }
            }
        }
        return _build.call( this, _scope.querySelectorAll( _selector ), _selector );
    };

    Microbe.core.__init__.prototype = Microbe.core;
};

},{}],14:[function(require,module,exports){
module.exports = function( Microbe )
{
    Microbe.ready = require( './ready' );
};

},{"./ready":15}],15:[function(require,module,exports){
module.exports = function( _callback )
{
    /* Mozilla, Chrome, Opera */
    if ( document.addEventListener )
    {
        document.addEventListener( 'DOMContentLoaded', _callback, false );
    }
    /* Safari, iCab, Konqueror */
    if ( /KHTML|WebKit|iCab/i.test( navigator.userAgent ) )
    {
        var DOMLoadTimer = setInterval(function ()
        {
            if ( /loaded|complete/i.test( document.readyState ) )
            {
                _callback();
                clearInterval( DOMLoadTimer );
            }
        }, 10);
    }
    /* Other web browsers */
    window.onload = _callback;
};

},{}],16:[function(require,module,exports){
module.exports = function( Microbe )
{
    var Promise = require( 'promise' );

    /**
     * microbe.http.js
     *
     * @author  Mouse Braun         <mouse@sociomantic.com>
     * @author  Nicolas Brugneaux   <nicolas.brugneaux@sociomantic.com>
     *
     * @package Microbe
     */
    Microbe.http = function( _parameters )
    {
        var fail,
            req, method, url, data, user, password, headers, async;

        if ( !_parameters )
        {
            return new Error( 'No parameters given' );
        }
        else
        {
            if ( typeof _parameters === 'string' )
            {
                _parameters = { url: _parameters };
            }

            req         = new XMLHttpRequest();
            method      = _parameters.method || 'GET';
            url         = _parameters.url;
            data        = JSON.stringify( _parameters.data ) || null;
            user        = _parameters.user || '';
            password    = _parameters.password || '';
            headers     = _parameters.headers  || null;
            async       = typeof _parameters.async === "boolean" ?
                                _parameters.async : true;

            req.onreadystatechange = function()
            {
                if ( req.readyState === 4 )
                {
                    return req;
                }
            };
        }

        req.open( method, url, async, user, password );

        // weird Safari voodoo fix
        if ( method === 'POST' )
        {
            req.setRequestHeader( 'Content-Type', 'application/x-www-form-urlencoded' );
        }
        
        if ( headers )
        {
            for ( var header in headers )
            {
                req.setRequestHeader( header, headers[header] );
            }
        }

        if ( async )
        {
            return new Promise( function( resolve, reject )
            {
                req.onerror = function()
                {
                    reject( new Error( 'Network error!' ) );
                };

                req.send( data );
                req.onload = function()
                {
                    if ( req.status === 200 )
                    {
                        resolve( req.response );
                    }
                    else
                    {
                        reject( new Error( req.status ) );
                    }
                };

            });
        }
        else
        {
            var _response = function( _val )
            {
                var _responses =
                {
                    then: function( _cb )
                    {
                        if ( _val.status === 200 )
                        {
                            _cb( _val.responseText );
                        }
                        return _responses;
                    },
                    catch: function( _cb )
                    {
                        if ( _val.status !== 200 )
                        {
                            _cb({
                                status      : _val.status,
                                statusText  : _val.statusText
                            });
                        }
                        return _responses;
                    }
                };
                return _responses;
            };

            req.send( data );
            req.onloadend = function()
            {
                req.onreadystatechange();
                return _response( req );
            };
            return req.onloadend();
        }
    };

    Microbe.http.get = function( _url )
    {
        return this({
            url     : _url,
            method  : 'GET'
        });
    };

    Microbe.http.post = function( _url, _data )
    {
        return this({
            url     : _url,
            data    : _data,
            method  : 'POST'
        });
    };
};

},{"promise":5}],17:[function(require,module,exports){
module.exports = function( Microbe )
{
    // shim needed for observe
    if ( ! Object.observe )
    {
        require( 'setimmediate' );
        require( 'observe-shim' );
        var ObserveUtils = require( 'observe-utils' );
    }


    /**
     * Get data parameter
     *
     * gets the index of the item in it's parentNode's children array
     *
     * @return {arr}                       array of values
     */
    Microbe.prototype.get = function( prop )
    {
        var _get = function( _el )
        {
            if ( ! prop )
            {
                return _el.data;
            }
            else
            {
                if ( _el.data[ prop ] && _el.data[ prop ][ prop ] )
                {
                    return _el.data[ prop ][ prop ];
                }
                else
                {
                    return false;
                }
            }
        };

        var i, len, values = new Array( this.length );

        for ( i = 0, len = this.length; i < len; i++ )
        {
            values[ i ] = _get( this[ i ] );
        }

        return values;
    };


    /**
     * Observe
     *
     * applies a function to an element if it is changed from within µ
     *
     * @param  {func}               function            function to apply
     * @param  {str}                _prop               property to observe
     * @param  {bool}               _once               bool to trigger auto unobserve
     *
     * @return  Microbe
    */
    Microbe.prototype.observe = function( prop, func, _once )
    {
        var _observe = function( _elm )
        {
            var _setObserve = function( _target, _prop )
            {
                if ( _once === true )
                {
                    var _func = function( e )
                    {
                        _target._observeFunc( e );
                        Object.unobserve( _target, _func );

                    }.bind( this );

                    Object.observe( _target, _func );
                }
                else
                {
                    Object.observe( _target, _target._observeFunc );
                }
            };

            var _setObserveFunc = function( _target )
            {
                if ( _target._observeFunc )
                {
                    Object.unobserve( _target, _target._observeFunc );
                }

                _target._observeFunc     = func;

                return _target;
            };


            _elm.data   = _elm.data || {};
            var _data   = _elm.data;
            func        = func.bind( this );

            var target = null;

            if ( prop )
            {
                _data[ prop ]  = _data[ prop ] || {};

                target = _setObserveFunc( _data[ prop ] );
                _setObserve( target, prop );
            }
            else
            {
                var _props = [ 'attr', 'text', 'css', 'html', 'class' ];

                for ( var i = 0, lenI = _props.length; i < lenI; i++ )
                {
                    _data[ _props[ i ] ] = _data[ _props[ i ] ] || {};

                    target = _setObserveFunc( _data[ _props[ i ] ] );
                    _setObserve( target, _props[ i ] );
                }

                target = _setObserveFunc( _data );
                _setObserve( target, null );

            }
        }.bind( this );

        if ( typeof prop === 'function' )
        {
            func    = prop;
            prop    = null;
        }

        var i, len, results = new Array( this.length );

        for ( i = 0, len = this.length; i < len; i++ )
        {
            _observe( this[ i ] );
        }

        return this;
    };


    /**
     * Observe Once
     *
     * applies a function to an element if it is changed from within µ (once)
     *
     * @param  {func}               function            function to apply
     * @param  {str}                _prop               property to observe
     *
     * @return  Microbe
    */
    Microbe.prototype.observeOnce = function( func, _prop )
    {
        this.observe( func, _prop, true );
    };


    /**
     * Get data parameter
     *
     * gets the index of the item in it's parentNode's children array
     *
     * @return {arr}                       array of values
     */
    Microbe.prototype.set = function( prop, value )
    {
        var _set = function( _el )
        {
            _el.data                    = _el.data || {};
            
            // shim
            if ( ObserveUtils && ! _el.data[ prop ] )
            {
                ObserveUtils.defineObservableProperties( _el.data, prop );
            }

            _el.data[ prop ]            = _el.data[ prop ] || {};
            _el.data[ prop ][ prop ]    = value;
        };

        var i, len, values = new Array( this.length );

        for ( i = 0, len = this.length; i < len; i++ )
        {
            values[ i ] = _set( this[ i ] );
        }

        return this;
    };


    /**
     * Stop observing
     *
     * stops watching the data changes of a µ onject
     *
     * @param   _el         HTMLELement             element to watch (optional)
     *
     * @return  Microbe
    */
    Microbe.prototype.unobserve = function( _prop )
    {
        var _unobserve = function( _elm )
        {
            var _data = _elm.data;

            if ( _data )
            {
                if ( _prop && _data[ _prop ] && _data[ _prop ]._observeFunc )
                {
                    Object.unobserve( _data[ _prop ], _data[ _prop ]._observeFunc );
                }
                else if ( ! _prop )
                {
                    if ( _data._observeFunc )
                    {
                        Object.unobserve( _data, _data._observeFunc );
                    }

                    for ( _prop in _data )
                    {
                        if ( _data[ _prop ]._observeFunc )
                        {
                            Object.unobserve( _data[ _prop ], _data[ _prop ]._observeFunc );
                        }
                    }
                }
            }
        }.bind( this );

        var i, len, results = new Array( this.length );
        for ( i = 0, len = this.length; i < len; i++ )
        {
            _unobserve( this[ i ] );
        }

        return this;
    }
};

},{"observe-shim":3,"observe-utils":4,"setimmediate":11}],18:[function(require,module,exports){
module.exports =
{
    fill            : Array.prototype.fill,
    pop             : Array.prototype.pop,
    push            : Array.prototype.push,
    reverse         : Array.prototype.reverse,
    shift           : Array.prototype.shift,
    sort            : Array.prototype.sort,
    splice          : Array.prototype.splice,
    unshift         : Array.prototype.unshift,
    concat          : Array.prototype.concat,
    join            : Array.prototype.join,
    slice           : Array.prototype.slice,
    toSource        : Array.prototype.toSource,
    toString        : Array.prototype.toString,
    toLocaleString  : Array.prototype.toLocaleString,
    indexOf         : Array.prototype.indexOf,
    lastIndexOf     : Array.prototype.lastIndexOf,
    forEach         : Array.prototype.forEach,
    entries         : Array.prototype.entries,
    every           : Array.prototype.every,
    some            : Array.prototype.some,
    filter          : Array.prototype.filter,
    find            : Array.prototype.find,
    findIndex       : Array.prototype.findIndex,
    keys            : Array.prototype.keys,
    map             : Array.prototype.map,
    reduce          : Array.prototype.reduce,
    reduceRight     : Array.prototype.reduceRight,
    copyWithin      : Array.prototype.copyWithin
};

},{}],19:[function(require,module,exports){
module.exports =
{
    charAt              : String.prototype.charAt,
    charCodeAt          : String.prototype.charCodeAt,
    codePointAt         : String.prototype.codePointAt,
    concat              : String.prototype.concat,
    contains            : String.prototype.contains,
    endsWith            : String.prototype.endsWith,
    indexOf             : String.prototype.indexOf,
    lastIndexOf         : String.prototype.lastIndexOf,
    localeCompare       : String.prototype.localeCompare,
    match               : String.prototype.match,
    normalize           : String.prototype.normalize,
    quote               : String.prototype.quote,
    repeat              : String.prototype.repeat,
    replace             : String.prototype.replace,
    search              : String.prototype.search,
    slice               : String.prototype.slice,
    split               : String.prototype.split,
    startsWith          : String.prototype.startsWith,
    substr              : String.prototype.substr,
    substring           : String.prototype.substring,
    toLocaleLowerCase   : String.prototype.toLocaleLowerCase,
    toLocaleUpperCase   : String.prototype.toLocaleUpperCase,
    toLowerCase         : String.prototype.toLowerCase,
    toSource            : String.prototype.toSource,
    toString            : String.prototype.toString,
    toUpperCase         : String.prototype.toUpperCase,
    trim                : String.prototype.trim,
    trimLeft            : String.prototype.trimLeft,
    trimRight           : String.prototype.trimRight,
    valueOf             : String.prototype.valueOf
};

},{}],20:[function(require,module,exports){
module.exports =
{
    '[object Boolean]'  : 'boolean',
    '[object Number]'   : 'number',
    '[object String]'   : 'string',
    '[object Function]' : 'function',
    '[object Array]'    : 'array',
    '[object Date]'     : 'date',
    '[object RegExp]'   : 'regExp',
    '[object Object]'   : 'object',
    '[object Error]'    : 'error',
    '[object Promise]'  : 'promise',
    '[object Microbe]'  : 'microbe'
};

},{}]},{},[1])(1)
});