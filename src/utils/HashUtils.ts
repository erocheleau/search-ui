import {Assert} from '../misc/Assert';
import {Utils} from '../utils/Utils';

export class HashUtils {
  private static DELIMITER = {
    'objectStart': '{',
    'objectEnd': '}',
    'arrayStart': '[',
    'arrayEnd': ']',
    'objectStartRegExp': '^{',
    'objectEndRegExp': '}+$',
    'arrayStartRegExp': '^[',
    'arrayEndRegExp': ']+$'
  };

  public static getHash(w = window): string {
    Assert.exists(w);

    // window.location.hash returns the DECODED hash on Firefox (it's a well known bug),
    // so any & in values will be already unescaped. This breaks our value splitting.
    // The following trick works on all browsers.
    var ret = '#' + (w.location.href.split('#')[1] || '');
    return HashUtils.getAjaxcrawlableHash(ret);
  }

  public static getValue(value: string, toParse: string): any {
    Assert.isNonEmptyString(value);
    Assert.exists(toParse);
    toParse = HashUtils.getAjaxcrawlableHash(toParse);
    var paramValue = HashUtils.getRawValue(value, toParse);
    if (paramValue != undefined) {
      paramValue = HashUtils.getValueDependingOnType(paramValue);
    }
    return paramValue;
  }

  public static encodeValues(values: {}): string {
    var hash: String[] = [];
    _.each(<_.Dictionary<any>>values, (valueToEncode, key, obj?) => {
      var encodedValue = '';
      if (Utils.isNonEmptyArray(valueToEncode)) {
        encodedValue = HashUtils.encodeArray(valueToEncode);
      } else if (_.isObject(valueToEncode) && Utils.isNonEmptyArray(_.keys(valueToEncode))) {
        encodedValue = HashUtils.encodeObject(valueToEncode);
      } else {
        encodedValue = encodeURIComponent(valueToEncode.toString());
      }
      if (encodedValue != '') {
        hash.push(key + '=' + encodedValue);
      }
    });

    return hash.join('&');
  }

  private static getAjaxcrawlableHash(hash: string) {
    if (hash[1] != undefined && hash[1] == '!') {
      return hash.substring(0, 1) + hash.substring(2);
    } else {
      return hash;
    }
  }

  private static getRawValue(value: string, toParse: string): string {
    Assert.exists(value);
    Assert.exists(toParse);
    Assert.check(toParse.indexOf('#') == 0 || toParse == '');

    var toParseArray = toParse.substr(1).split('&');
    var paramPos = 0;
    var loop = true;
    var paramValue: string = undefined;
    while (loop) {
      var paramValuePair = toParseArray[paramPos].split('=');
      if (paramValuePair[0] == value) {
        loop = false;
        paramValue = paramValuePair[1];
      } else {
        paramPos++;
        if (paramPos >= toParseArray.length) {
          paramPos = undefined;
          loop = false;
        }
      }
    }
    return paramValue;
  }

  private static getValueDependingOnType(paramValue: string): any {
    var type = HashUtils.getValueType(paramValue);
    var returnValue;
    if (type == 'object') {
      returnValue = HashUtils.decodeObject(paramValue);
    } else if (type == 'array') {
      returnValue = HashUtils.decodeArray(paramValue);
    } else {
      returnValue = decodeURIComponent(paramValue);
    }
    return returnValue;
  }

  private static getValueType(paramValue: string): string {
    if (HashUtils.isObject(paramValue)) {
      return 'object';
    } else if (HashUtils.isArray(paramValue)) {
      return 'array';
    } else {
      return 'other';
    }
  }

  private static isArrayStartNotEncoded(value: string) {
    return value.substr(0, 1) == HashUtils.DELIMITER.arrayStart;
  }

  private static isArrayStartEncoded(value: string) {
    return value.indexOf(encodeURIComponent(HashUtils.DELIMITER.arrayStart)) == 0;
  }

  private static isArrayEndNotEncoded(value: string) {
    return value.substr(value.length - 1);
  }

  private static isArrayEndEncoded(value: string) {
    return value.indexOf(encodeURIComponent(HashUtils.DELIMITER.arrayEnd)) == value.length - encodeURIComponent(HashUtils.DELIMITER.arrayEnd).length;
  }

  private static isObjectStartNotEncoded(value: string) {
    return value.substr(0, 1) == HashUtils.DELIMITER.objectStart;
  }

  private static isObjectStartEncoded(value: string) {
    return value.indexOf(encodeURIComponent(HashUtils.DELIMITER.objectStart)) == 0;
  }

  private static isObjectEndNotEncoded(value: string) {
    return value.substr(value.length - 1) == HashUtils.DELIMITER.objectEnd;
  }

  private static isObjectEndEncoded(value: string) {
    return value.indexOf(encodeURIComponent(HashUtils.DELIMITER.objectEnd)) == value.length - encodeURIComponent(HashUtils.DELIMITER.objectEnd).length;
  }

  private static isObject(value: string) {
    var isObjectStart = HashUtils.isObjectStartNotEncoded(value) || HashUtils.isObjectStartEncoded(value);
    var isObjectEnd = HashUtils.isObjectEndNotEncoded(value) || HashUtils.isObjectEndEncoded(value);
    return isObjectStart && isObjectEnd;
  }

  private static isArray(value: string) {
    var isArrayStart = HashUtils.isArrayStartNotEncoded(value) || HashUtils.isArrayStartEncoded(value);
    var isArrayEnd = HashUtils.isArrayEndNotEncoded(value) || HashUtils.isArrayEndEncoded(value);
    return isArrayStart && isArrayEnd;
  }

  public static encodeArray(array: string[]): string {
    var arrayReturn = _.map(array, (value) => {
      return encodeURIComponent(value);
    });
    return HashUtils.DELIMITER.arrayStart + arrayReturn.join(',') + HashUtils.DELIMITER.arrayEnd;
  }

  public static encodeObject(obj: Object): string {
    var retArray = _.map(<_.Dictionary<any>>obj, (val, key?, obj?) => {
      return `"${encodeURIComponent(key)}":${this.encodeValue(val)}`;
    });
    return HashUtils.DELIMITER.objectStart + retArray.join(' , ') + HashUtils.DELIMITER.objectEnd;
  }

  private static encodeValue(val: any) {
    var encodedValue = '';
    if (_.isArray(val)) {
      encodedValue = HashUtils.encodeArray(val);
    } else if (_.isObject(val)) {
      encodedValue = HashUtils.encodeObject(val);
    } else if (_.isNumber(val) || _.isBoolean(val)) {
      encodedValue = encodeURIComponent(val);
    } else {
      encodedValue = '"' + encodeURIComponent(val) + '"';
    }
    return encodedValue;
  }

  private static decodeObject(obj: string): Object {
    if (HashUtils.isObjectStartEncoded(obj) && HashUtils.isObjectEndEncoded(obj)) {
      obj = obj.replace(/encodeURIComponent(HashUtils.Delimiter.objectStart)/, HashUtils.DELIMITER.objectStart);
      obj = obj.replace(encodeURIComponent(HashUtils.DELIMITER.objectEnd), HashUtils.DELIMITER.objectEnd);
    }
    return JSON.parse(decodeURIComponent(obj));
  }

  private static decodeArray(value: string): any[] {
    if (HashUtils.isArrayStartEncoded(value) && HashUtils.isArrayEndEncoded(value)) {
      value = value.replace(encodeURIComponent(HashUtils.DELIMITER.arrayStart), HashUtils.DELIMITER.arrayStart);
      value = value.replace(encodeURIComponent(HashUtils.DELIMITER.arrayEnd), HashUtils.DELIMITER.arrayEnd);
    }
    value = value.substr(1);
    value = value.substr(0, value.length - 1);
    var array = value.split(',');
    return _.map(array, (val) => {
      return decodeURIComponent(val);
    });
  }
}
