import { whatType, whatTextType } from '../index.utils';
import { ApiBodyType, ApiEditBody, JsonRootType } from '../../shared/services/storage/index.model';
import { flatData } from '../tree/tree.utils';

export const isXML = (data) => {
  const parser = new DOMParser();
  let xml = null;
  try {
    const xmlContent = parser.parseFromString(data, 'text/xml');
    xml = xmlContent.getElementsByTagName('parsererror');
  } catch (error) {
    return false;
  }
  if (xml.length > 0) {
    return false;
  }
  return true;
};
/**
 * Parse item to eoTableComponent need
 */
export const parseTree = (key, value, level = 0) => {
  if (whatType(value) === 'object') {
    return {
      name: key,
      required: true,
      example: '',
      type: 'object',
      description: '',
      listDepth: level,
      children: Object.keys(value).map((it) => parseTree(it, value[it], level + 1)),
    };
  }
  if (whatType(value) === 'array') {
    // * Just pick first element
    const [data] = value;
    // If array element is primitive value
    if (whatType(data) === 'string') {
      return {
        name: key,
        required: true,
        //TODO only test page has value
        value: JSON.stringify(value),
        //TODO only edit page has example
        example: JSON.stringify(value),
        type: 'array',
        description: '',
        listDepth: level,
      };
    }
    return {
      name: key,
      required: true,
      example: '',
      type: 'array',
      description: '',
      listDepth: level,
      children: data ? Object.keys(data).map((it) => parseTree(it, data[it], level + 1)) : [],
    };
  }
  // * value is string & number & null
  return {
    name: key,
    value: value == null ? '' : value.toString(),
    description: '',
    type: whatType(value),
    required: true,
    example: value == null ? '' : value.toString(),
    listDepth: level,
  };
};
/**
 * Parse item to table need row data
 */
export const form2json = (tmpl) =>
  tmpl
    .split('\n')
    .filter((it) => it.trim())
    .map((it) => it.split(':'))
    .map((it) => {
      const [key, value] = it;
      return { key: key?.trim(), value: value?.trim() };
    });

export const xml2json = (tmpl) => {
  // * delete <?xml ... ?>
  let xml = tmpl.replace(/<\?xml.+\?>/g, '').trim();
  if (xml === '') {
    return [];
  }
  const startTag = /^<([^>\s\/]+)((\s+[^=>\s]+(\s*=\s*((\"[^"]*\")|(\'[^']*\')|[^>\s]+))?)*)\s*\/?\s*>/m;
  const endTag = /^<\/([^>\s]+)[^>]*>/m;
  const stack = [];
  const result = [];
  let start = null;
  let index = null;
  while (xml) {
    // * handle end tags
    if (xml.substring(0, 2) === '</') {
      const end = xml.match(endTag);
      const [str, label] = end;
      const last = stack.pop();
      if (last.tagName !== label) {
        throw new Error(`Parse error 101. [${last.tagName}] is not eq [${label}]`);
      }
      if (stack.length === 0) {
        result.push(last);
      } else {
        const parent = stack.pop();
        parent.children.push(last);
        stack.push(parent);
      }
      index = xml.indexOf(str) === -1 ? 0 : xml.indexOf(str);
      xml = xml.substring(index + str.length).trim();
      index = null;
      continue;
    }
    // * handle start tags
    if (xml.indexOf('<') === 0 && (start = xml.match(startTag))) {
      const [str, label, attr] = start;
      if (str.slice(-2) === '/>') {
        // * single tag
        const parent = stack.pop();
        parent.children.push({
          tagName: label.trim(),
          attr: attr.trim(),
          content: '',
          children: [],
        });
        stack.push(parent);
        xml = xml.trim().substring(str.length);
        continue;
      }
      stack.push({
        tagName: label.trim(),
        attr: attr.trim(),
        content: '',
        children: [],
      });
      index = xml.indexOf(str) === -1 ? 0 : xml.indexOf(str);
      xml = xml.substring(index + str.length);
      index = null;
      continue;
    }
    // * handle text content
    if (xml.indexOf('<') > 0) {
      index = xml.indexOf('<');
      const content = xml.slice(0, index);
      const last = stack.pop();
      last.content += content;
      stack.push(last);
      xml = xml.substring(index).trim();
      index = null;
      continue;
    }
    xml = xml.trim();
  }
  if (stack.length) {
    throw new Error('Parse error 102');
  }
  // console.log(JSON.stringify(result, null, 2));
  return result;
};

type uiData = {
  textType: ApiBodyType;
  rootType: JsonRootType;
  data: ApiEditBody | any;
};

export const xml2UiData = (text) => {
  const data: any[] = xml2json(text);
  const deep = (list = []) =>
    list.reduce(
      (total, { tagName, content, attr, children }) => ({
        ...total,
        [tagName]: children?.length > 0 ? deep(children || []) : content,
        // attribute: attr,  // * not support the key for now cause ui has not show it
      }),
      {}
    );
  const result = deep(data);
  console.log('result', result);
  return JSON.parse(JSON.stringify(result));
};
/**
 * Json object 2 xml
 *
 * @param o Object
 * @param tab tab or indent string for pretty output formatting,omit or use empty string "" to supress.
 * @returns
 */
export const json2XML: (o: object, tab?) => string = (o, tab) => {
  const toXml = function (v, name, ind) {
    let xml = '';
    if (v instanceof Array) {
      for (let i = 0, n = v.length; i < n; i++) {
        xml += ind + toXml(v[i], name, ind + '\t') + '\n';
      }
    } else if (typeof v == 'object') {
      let hasChild = false;
      xml += ind + '<' + name;
      for (var m in v) {
        if (m.charAt(0) == '@') {
          xml += ' ' + m.substr(1) + '="' + v[m].toString() + '"';
        } else {
          hasChild = true;
        }
      }
      xml += hasChild ? '>' : '/>';
      if (hasChild) {
        for (var m in v) {
          if (m == '#text') {
            xml += v[m];
          } else if (m == '#cdata') {
            xml += '<![CDATA[' + v[m] + ']]>';
          } else if (m.charAt(0) != '@') {
            xml += toXml(v[m], m, ind + '\t');
          }
        }
        xml += (xml.charAt(xml.length - 1) == '\n' ? ind : '') + '</' + name + '>';
      }
    } else {
      xml += ind + '<' + name + '>' + v.toString() + '</' + name + '>';
    }
    return xml;
  };
  let xml = '';
  for (const m in o) {
    if (Object.prototype.hasOwnProperty.call(o, m)) {
      xml += toXml(o[m], m, '');
    }
  }
  return tab ? xml.replace(/\t/g, tab) : xml.replace(/\t|\n/g, '');
};

/**
 * Transfer text to json/xml/raw ui data,such as request body/response body
 * Flat array with listdepth
 *
 * @returns body info
 */
export const text2UiData: (text: string) => uiData = (text) => {
  const result: uiData = {
    textType: ApiBodyType.Raw,
    rootType: JsonRootType.Object,
    data: text,
  };
  const textType = whatTextType(text);
  result.textType = ['xml', 'json'].includes(textType) ? (textType as ApiBodyType) : ApiBodyType.Raw;
  switch (result.textType) {
    case 'xml': {
      result.data = xml2UiData(text);
      result.data = flatData(Object.keys(result.data).map((it) => parseTree(it, result.data[it])));
      break;
    }
    case 'json': {
      result.data = JSON.parse(result.data);
      result.data = flatData(Object.keys(result.data).map((it) => parseTree(it, result.data[it])));
      break;
    }
    default: {
      break;
    }
  }
  return result;
};

/**
 * Format eoapi body to json
 * !TODO Current just from sass apikit,need refactor
 *
 * @param eoapiArr
 * @param inputOptions
 * @returns
 */
export const uiData2Json = function (eoapiArr: ApiEditBody[], inputOptions) {
  inputOptions = inputOptions || {};
  let result = {};
  const loopFun = (inputArr, inputObject) => {
    if (inputOptions.checkXmlAttr) {
      inputObject['@eo_attr'] = inputObject['@eo_attr'] || {};
    }
    for (const val of inputArr || []) {
      if (!val.name) {
        continue;
      }
      // if (!val.required && !inputOptions.ignoreCheckbox) {
      //   continue;
      // }
      const tmpKey = val.name;
      if (inputOptions.checkXmlAttr) {
        if (val.isErrorXmlAttr) {
          throw new Error('errorXmlAttr');
        }
        if (inputObject['@eo_attr'].hasOwnProperty(tmpKey)) {
          inputObject['@eo_attr'][tmpKey] = [
            inputObject['@eo_attr'][tmpKey],
            (val.attribute || '').replace(/\s+/, ' '),
          ];
        } else {
          inputObject['@eo_attr'][tmpKey] = (val.attribute || '').replace(/\s+/, ' ');
        }
      }
      inputObject[tmpKey] = val.example;
      if (val.children && val.children.length > 0) {
        switch (val.type) {
          case 'array': {
            if (inputOptions.checkXmlAttr) {
              inputObject['@eo_attr'][tmpKey] = [inputObject['@eo_attr'][tmpKey]];
            }
            inputObject[tmpKey] = [{}];
            loopFun(val.children, inputObject[tmpKey][0]);
            break;
          }
          default: {
            inputObject[tmpKey] = {};
            loopFun(val.children, inputObject[tmpKey]);
            break;
          }
        }
      } else {
        const tmpDefaultTypeValueObj = {
          boolean: 'false',
          array: '[]',
          object: '{}',
          number: '0',
          int: '0',
        };
        switch (val.type) {
          case 'string': {
            inputObject[tmpKey] = inputObject[tmpKey] || '';
            break;
          }
          case 'null': {
            inputObject[tmpKey] = null;
            break;
          }
          default: {
            try {
              inputObject[tmpKey] = JSON.parse(inputObject[tmpKey] || tmpDefaultTypeValueObj[val.type]);
            } catch (JSON_PARSE_ERROR) {
              inputObject[tmpKey] = inputObject[tmpKey] || '';
            }
            break;
          }
        }
      }
    }
  };
  loopFun(eoapiArr, result);
  if (inputOptions.rootType === JsonRootType.Array) {
    result = [result];
  }
  return result;
};
