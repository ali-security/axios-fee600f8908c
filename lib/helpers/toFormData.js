'use strict';

var utils = require('../utils');
var AxiosError = require('../core/AxiosError');

/**
 * Convert a data object to FormData
 * @param {Object} obj
 * @param {?Object} [formData]
 * @param {?Object} [options]
 * @param {?number} [options.maxDepth] maximum nesting depth allowed (defaults to 100)
 * @returns {Object}
 **/

function toFormData(obj, formData, options) {
  // eslint-disable-next-line no-param-reassign
  formData = formData || new FormData();

  // eslint-disable-next-line no-param-reassign
  options = options || {};

  var maxDepth = options.maxDepth === undefined ? 100 : options.maxDepth;

  var stack = [];

  function convertValue(value) {
    if (value === null) return '';

    if (utils.isDate(value)) {
      return value.toISOString();
    }

    if (utils.isArrayBuffer(value) || utils.isTypedArray(value)) {
      return typeof Blob === 'function' ? new Blob([value]) : Buffer.from(value);
    }

    return value;
  }

  /**
   * Walk a value that is about to be handed to `JSON.stringify` and reject it
   * once it is nested deeper than `maxDepth`.
   *
   * `build()` only guards the branches it recurses through itself, so a value
   * serialised by the `key{}` meta token used to skip the depth guard entirely
   * and blow the stack inside `JSON.stringify` (an unrecoverable RangeError).
   *
   * @param {*} value the value being serialised
   * @param {number} depth the current nesting level
   */
  function assertValueDepth(value, depth) {
    if (depth > maxDepth) {
      throw new AxiosError(
        'Object is too deeply nested (' + depth + ' levels). Max depth: ' + maxDepth,
        AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED
      );
    }

    if (!utils.isObject(value) || stack.indexOf(value) !== -1) {
      return;
    }

    stack.push(value);

    utils.forEach(value, function each(el) {
      assertValueDepth(el, depth + 1);
    });

    stack.pop();
  }

  function build(data, parentKey, depth) {
    // eslint-disable-next-line no-param-reassign
    depth = depth || 0;

    if (utils.isPlainObject(data) || utils.isArray(data)) {
      if (depth > maxDepth) {
        throw new AxiosError(
          'Object is too deeply nested (' + depth + ' levels). Max depth: ' + maxDepth,
          AxiosError.ERR_FORM_DATA_DEPTH_EXCEEDED
        );
      }

      if (stack.indexOf(data) !== -1) {
        throw Error('Circular reference detected in ' + parentKey);
      }

      stack.push(data);

      utils.forEach(data, function each(value, key) {
        if (utils.isUndefined(value)) return;
        var fullKey = parentKey ? parentKey + '.' + key : key;
        var arr;

        if (value && !parentKey && typeof value === 'object') {
          if (utils.endsWith(key, '{}')) {
            assertValueDepth(value, 1);
            // eslint-disable-next-line no-param-reassign
            value = JSON.stringify(value);
          } else if (utils.endsWith(key, '[]') && (arr = utils.toArray(value))) {
            // eslint-disable-next-line func-names
            arr.forEach(function(el) {
              !utils.isUndefined(el) && formData.append(fullKey, convertValue(el));
            });
            return;
          }
        }

        build(value, fullKey, depth + 1);
      });

      stack.pop();
    } else {
      formData.append(parentKey, convertValue(data));
    }
  }

  build(obj);

  return formData;
}

module.exports = toFormData;
