// Copyright (C) 2026 Eklavya Sharma. Licensed under MIT (https://opensource.org/license/mit).

export function compose(...args) {
    return function(x) {
        let y = x;
        for(const f of args.toReversed()) {
            y = f(y);
        }
        return y;
    }
}

export const svgNS = 'http://www.w3.org/2000/svg';
export const debugInfo = {'input': undefined, 'output': undefined};
const laneNameToType = {'log': 'div', 'break': 'div', 'misc': 'div',
    'svg': 'svg', 'table': 'table'};
export const f2fRegistry = [];
let prevParamsString = window.location.search;

//=[ Converters and Validators ]================================================

class InputError extends Error {
    constructor(message) {
        super(message);
        this.name = "InputError";
    }
}

export function toInt(s) {
    s = s.trim();
    if(/^-?\d+$/.test(s)) {
        return parseInt(s);
    }
    else {
        throw new InputError(s + ' is not an integer');
    }
}

function toFloatSingle(s) {
    s = s.trim();
    if(s === '') {
        throw new InputError('empty input');
    }
    else if(isNaN(s)) {
        throw new InputError(s + ' is not a number');
    }
    else {
        return parseFloat(s);
    }
}

export function toFloat(s) {
    let parts = s.split('/');
    if(parts.length >= 3) {
        throw new InputError(s + ' has too many forward slashes')
    }
    else if(parts.length == 2) {
        const n = toInt(parts[0]);
        const d = toInt(parts[1]);
        return n / d;
    }
    else {
        return toFloatSingle(s);
    }
}

export function assertGE(thresh) {
    return function(x) {
        if(x < thresh) {
            throw new InputError(x + ' is not ≥ ' + thresh);
        }
        return x;
    }
}

export function assertLE(thresh) {
    return function(x) {
        if(x > thresh) {
            throw new InputError(x + ' is not ≤ ' + thresh);
        }
        return x;
    }
}

export function assertInRange(lo, hi) {
    return function(x) {
        if(x < lo || x > hi) {
            throw new InputError(x + ` is not in range [${lo}, ${hi}]`);
        }
        return x;
    }
}

export function matrixConv(outSep, inSep, converter) {
    return function(s) {
        const rows = listConv(outSep, listConv(inSep, converter))(s);
        if(rows.length > 1) {
            const m = rows[0].length;
            for(let i=1; i<rows.length; ++i) {
                if(rows[i].length !== m) {
                    throw new InputError(`row ${i} has length ${rows[i].length} but row 0 has length ${m}`);
                }
            }
        }
        return rows;
    }
}

export function listConv(sep, converter) {
    return function(s) {
        let parts = s.split(sep);
        if(converter === undefined) {
            return parts;
        }
        else {
            return parts.map(converter);
        }
    }
}

//=[ Widgets and Params ]=======================================================

/* These widget objects are more like stateless templates.
You can make multiple of them using the create method with different idPrefixes,
and then use read and write with the appropriate key.
Only the constructor is user-facing.
*/

export class TextWidget {
    constructor({converter, required=true, defVal, placeholder, type='text'} = {}) {
        this.converter = converter;
        this.defVal = defVal;
        if(placeholder === undefined && (typeof defVal === 'string' || defVal instanceof String)) {
            this.placeholder = defVal;
        }
        else {
            this.placeholder = placeholder || '';
        }
        this.placeholder = placeholder;
        this.required = (defVal ? false : required);
        this.type = type;
    }

    read(key, value) {
        if(value) {
            return ((this.converter === undefined) ? value : this.converter(value));
        }
        else {
            if(this.required) {
                throw new InputError('emtpy value for ' + key);
            }
            else {
                return this.defVal;
            }
        }
    }

    write(key, value) {
        const elem = document.getElementById(key + '.input');
        elem.value = value;
    }

    transformQParam(key, value) {
        return value;
    }

    create(idPrefix) {
        let inputElem;
        if(this.type === 'textarea') {
            inputElem = document.createElement('textarea');
            inputElem.setAttribute('rows', '5');
        }
        else {
            inputElem = document.createElement('input');
        }
        inputElem.setAttribute('id', idPrefix + '.input');
        inputElem.setAttribute('type', this.type);
        inputElem.setAttribute('name', idPrefix);
        inputElem.setAttribute('autocomplete', 'off');
        inputElem.setAttribute('autocapitalize', 'none');
        inputElem.setAttribute('spellcheck', 'false');
        if(this.required) {
            inputElem.setAttribute('required', 'required');
        }
        if(this.defVal) {
            inputElem.setAttribute('placeholder', this.placeholder);
        }
        return inputElem;
    }
}

export class CheckBoxWidget {
    constructor({defVal=false} = {}) {
        this.defVal = defVal;
    }

    read(key, value) {
        // `value` is obtained using `new FormData(formElem)`.
        return Boolean(value);
    }

    write(key, value) {
        // `value` is obtained from URL querystring
        const elem = document.getElementById(key + '.input');
        elem.checked = (value === null) ? this.defVal : (value === 'on');
    }

    transformQParam(key, value) {
        // `value` is obtained using `new FormData(formElem)`.
        const x = Boolean(value);
        if(x != this.defVal) {
            return x ? 'on' : 'off';
        }
        else {
            return null;
        }
    }

    create(idPrefix) {
        const inputElem = document.createElement('input');
        inputElem.setAttribute('id', idPrefix + '.input');
        inputElem.setAttribute('type', 'checkbox');
        inputElem.setAttribute('name', idPrefix);
        if(this.defVal) {
            inputElem.setAttribute('checked', 'checked');
        }
        return inputElem;
    }
}

export class SelectOption {
    constructor({name, value, text} = {}) {
        this.name = name;  // name used by browser when submitting form
        this.value = ((value === undefined) ? name : value);  // value passed to our function
        this.text = ((text === undefined) ? name : text);  // text displayed in UI
    }
}

export class SelectWidget {
    constructor(options, defName) {
        // options (required): list of SelectOption elements
        // defName (optional): default selected option
        this.options = options;
        this.defName = defName;
        this.nameToValue = new Map();
        for(const option of options) {
            if(this.nameToValue.has(option.name)) {
                throw new Error('Select option ' + option.name + ' already used');
            }
            this.nameToValue.set(option.name, option.value);
        }
    }

    create(idPrefix) {
        const inputElem = document.createElement('select');
        inputElem.setAttribute('id', idPrefix + '.input');
        inputElem.setAttribute('name', idPrefix);
        inputElem.setAttribute('required', 'required');
        for(const option of this.options) {
            const optionElem = document.createElement('option');
            optionElem.setAttribute('value', option.name);
            if(option.name === this.defName) {
                optionElem.setAttribute('selected', 'selected');
            }
            optionElem.innerText = option.text;
            inputElem.appendChild(optionElem);
        }
        return inputElem;
    }

    read(key, value) {
        return this.nameToValue.get(value);
    }

    write(key, value) {
        const elem = document.getElementById(key + '.input');
        if(value) {
            elem.value = value;
        }
        else {
            elem.value = this.defName;
        }
    }

    transformQParam(key, value) {
        return value;
    }
}

function isValidParamName(s) {
    // return /^[a-zA-Z_][0-9a-zA-Z_]*$/.test(s);
    return true;
}

export class Param {
    constructor(name, widget, options = {}) {
        // name is used as input to user's function
        // options.label and options.description are shown in the UI
        this.name = name;
        this.label = (options.label === undefined ? name : options.label);
        if(!isValidParamName(name)) {
            throw new Error('Invalid parameter name ' + name);
        }
        this.widget = widget
        this.description = options.description;
    }
}

export class ParamGroup {
    constructor(name, paramList, options = {}) {
        // options: converter, label, description, compact=false
        options.compact = options.compact || false;
        this.name = name;
        if(!isValidParamName(name)) {
            throw new Error('Invalid parameter name ' + name);
        }
        this.paramList = paramList;
        this.label = (options.label === undefined ? name : options.label);
        this.description = options.description;
        this.converter = options.converter;
        this.compact = options.compact;
        let seenNames = new Set();
        for(const param of paramList) {
            if(seenNames.has(param.name)) {
                throw new Error('Parameter name ' + param.name + ' already used');
            }
            seenNames.add(param.name);
        }
    }
}

function addHelpElem(outer, helpBtn, helpText) {
    const helpElem = document.createElement('div');
    helpElem.classList.add('f2f-help-str');
    helpElem.classList.add('hidden');
    helpElem.innerText = helpText;
    outer.appendChild(helpElem);
    if(helpBtn !== undefined) {
        helpBtn.addEventListener('click', function(ev) {
            helpElem.classList.toggle('hidden');
        });
    }
}

function createFormItem(outerElem, param, path) {
    if(param.name === undefined) {
        throw new Error("missing param.name");
    }
    const idPrefix = [...path, param.name].join('.');
    const owrapperElem = document.createElement('div');
    owrapperElem.setAttribute('id', idPrefix + '.owrap');
    owrapperElem.classList.add('inputOwrap');
    if(param instanceof ParamGroup) {
        const fieldSetElem = document.createElement('fieldset');
        fieldSetElem.setAttribute('id', idPrefix + '.fieldset');
        fieldSetElem.classList.add('inputOwrap');
        if(param.compact) {
            fieldSetElem.classList.add('compact');
        }
        const labelElem = document.createElement('legend');
        fieldSetElem.appendChild(labelElem);
        if(param.description) {
            const labelText = document.createElement('span');
            labelText.innerText = param.label;
            labelElem.appendChild(labelText);
            const helpBtn = document.createElement('span');
            helpBtn.classList.add('f2f-help-btn');
            helpBtn.classList.add('inline');
            labelElem.appendChild(helpBtn);
            addHelpElem(fieldSetElem, helpBtn, param.description);
        }
        else {
            labelElem.innerText = param.label;
        }
        path.push(param.name);
        for(const childParam of param.paramList) {
            createFormItem(fieldSetElem, childParam, path);
        }
        path.pop();
        owrapperElem.appendChild(fieldSetElem);
    }
    else {
        const iwrapperElem = document.createElement('div');
        iwrapperElem.classList.add('inputIwrap');
        iwrapperElem.setAttribute('id', idPrefix + '.iwrap');
        owrapperElem.appendChild(iwrapperElem);
        const labelElem = document.createElement('label');
        labelElem.setAttribute('for', idPrefix + '.input');
        labelElem.innerText = param.label;
        let helpBtn;
        if(param.description) {
            helpBtn = document.createElement('div');
            helpBtn.classList.add('f2f-help-btn');
        }
        const inputElem = param.widget.create(idPrefix);
        if(param.widget instanceof CheckBoxWidget) {
            iwrapperElem.appendChild(inputElem);
            iwrapperElem.appendChild(labelElem);
            if(helpBtn !== undefined) {
                iwrapperElem.appendChild(helpBtn);
            }
        }
        else {
            iwrapperElem.appendChild(labelElem);
            if(helpBtn !== undefined) {
                iwrapperElem.appendChild(helpBtn);
            }
            iwrapperElem.appendChild(inputElem);
        }
        if(param.description) {
            addHelpElem(owrapperElem, helpBtn, param.description);
        }
    }
    const errorsElem = document.createElement('div');
    errorsElem.setAttribute('id', idPrefix + '.errors');
    errorsElem.classList.add('f2f-errors');
    owrapperElem.appendChild(errorsElem);
    outerElem.appendChild(owrapperElem);
}

export class Ostream {
    constructor(name, wrapperElem) {
        this.name = name;
        this.wrapperElem = wrapperElem;
        this.streamElem = document.createElement('div');
        this.streamElem.setAttribute('id', name);
        this.streamElem.classList.add('f2f-ostream');
        wrapperElem.appendChild(this.streamElem);
        this.laneName = undefined;
        this.laneElem = undefined;
    }

    clear() {
        this.laneName = undefined;
        this.laneElem = undefined;
        this.streamElem.innerText = '';
    }

    setLane(name, attrs) {
        if(name === this.laneName) {
            return;
        }
        const laneType = laneNameToType[name];
        if(laneType) {
            this.laneName = name;
            if(name === 'svg') {
                this.laneElem = document.createElementNS(svgNS, 'svg');
            }
            else {
                this.laneElem = document.createElement(laneType);
            }
            this.laneElem.classList.add('f2f-lane-' + name);
            if(attrs !== undefined) {
                for(const [attr, value] of Object.entries(attrs)) {
                    this.laneElem.setAttribute(attr, value);
                }
            }
            this.streamElem.appendChild(this.laneElem);
        }
        else {
            throw new Error('invalid lane name ' + name);
        }
    }

    addBreak() {
        this.setLane('break');
    }

    rawAdd(elem) {
        this.laneElem.appendChild(elem);
    }

    rawLog(args, klasses=[]) {
        this.setLane('log');
        const logLineElem = document.createElement('div');
        logLineElem.classList.add('f2f-log-line');
        for(const klass of klasses) {
            logLineElem.classList.add(klass);
        }
        const strArgs = args.map(x => '' + x);
        logLineElem.innerText = strArgs.join(' ');
        this.laneElem.appendChild(logLineElem);
    }

    log(...args) {this.rawLog(args);}
    info(...args) {this.rawLog(args, ['info']);}
    error(...args) {this.rawLog(args, ['error']);}
    warn(...args) {this.rawLog(args, ['warn']);}
    debug(...args) {this.rawLog(args, ['debug']);}
    success(...args) {this.rawLog(args, ['success']);}

    tableRow(row, head=false) {
        this.setLane('table');
        if(row instanceof Element) {
            this.laneElem.appendChild(row);
        }
        else {
            const rowElem = document.createElement('tr');
            const cellName = head ? 'th' : 'td';
            for(const x of row) {
                const cellElem = document.createElement(cellName);
                cellElem.innerText = x;
                rowElem.appendChild(cellElem);
            }
            this.laneElem.appendChild(rowElem);
        }
    }
}

export function createForm(wrapperId, paramGroup, func, options = {}) {
    if(options.clearOutput === undefined) {
        options.clearOutput = true;
    }
    const formName = paramGroup.name;
    const registryEntry = {'wrapperId': wrapperId, 'paramGroup': paramGroup,
        'formName': formName, 'func': func, 'options': options};
    f2fRegistry.push(registryEntry);
    const wrapperElem = document.getElementById(wrapperId);
    const formElem = document.createElement('form');
    if(formName !== undefined) {
        formElem.setAttribute('id', formName + '.form');
    }
    let path = formName === undefined ? [] : [formName];
    for(const param of paramGroup.paramList) {
        createFormItem(formElem, param, path);
    }
    const submitButton = document.createElement('button');
    submitButton.setAttribute('type', 'submit');
    submitButton.innerText = 'Run';
    formElem.appendChild(submitButton);
    wrapperElem.appendChild(formElem);
    const stdout = new Ostream('stdout', wrapperElem);
    registryEntry['stdout'] = stdout;
    const qparams = new URLSearchParams(window.location.search);
    fillForm(paramGroup, qparams);
    formElem.addEventListener('submit', function(ev) {
        ev.preventDefault();
        const formData = new FormData(formElem);
        const [input, status] = readForm(paramGroup, formData);
        debugInfo.input = input;
        if(status) {
            try {
                if(options.clearOutput) {
                    stdout.clear();
                }
                const output = func(input, stdout);
                debugInfo.output = output;
                if(output !== undefined) {
                    stdout.log(output);
                }
            }
            catch (error) {
                stdout.error(error.toString());
                throw error;
            }
            finally {
                stdout.addBreak();
            }
        }
    });
}

function handleReadError(error, errorsElem) {
    const errorElem = document.createElement('div');
    errorElem.classList.add('f2f-error');
    errorElem.innerText = (error instanceof InputError ? '' : error.name + ': ') + error.message;
    errorsElem.appendChild(errorElem);
}

function readFormItem(formData, output, outQParams, param, path) {
    if(param.name === undefined) {
        throw new Error("missing param.name");
    }
    const key = [...path, param.name].join('.');
    const errorsElem = document.getElementById(key + '.errors');
    if(errorsElem) {
        errorsElem.innerText = '';
    }
    if(param instanceof ParamGroup) {
        let output2 = {};
        let globalOk = true;
        path.push(param.name);
        for(const childParam of param.paramList) {
            const localOk = readFormItem(formData, output2, outQParams, childParam, path);
            if(!localOk) {
                globalOk = false;
            }
        }
        path.pop();
        if(param.converter) {
            try {
                output2 = param.converter(output2);
            }
            catch(error) {
                handleReadError(error, errorsElem);
                return false;
            }
        }
        output[param.name] = output2;
        return globalOk;
    }
    else {
        const value = formData.get(key);
        try {
            const qvalue = param.widget.transformQParam(key, value);
            if(qvalue !== undefined && qvalue !== null) {
                outQParams.set(key, qvalue);
            }
            output[param.name] = param.widget.read(key, value);
            return true;
        }
        catch (error) {
            if(error instanceof Error && errorsElem) {
                handleReadError(error, errorsElem);
                return false;
            }
            else {
                throw error;
            }
        }
    }
}

function readForm(paramGroup, formData) {
    // Assuming `formData` was generated using something like `new FormData(formElem)`,
    // converts `formData` to a dict and updates the browser's address bar.
    let path = paramGroup.name === undefined ? [] : [paramGroup.name];
    let output = {};
    let globalOk = true;
    const outQParams = new URLSearchParams();
    for(const param of paramGroup.paramList) {
        const localOk = readFormItem(formData, output, outQParams, param, path);
        if(!localOk) {
            globalOk = false;
        }
    }
    if(globalOk) {
        updateLocationWithFormData(outQParams, paramGroup.name);
    }
    return [output, globalOk];
}

//=[ URL Query Param Handling ]=================================================

function updateLocationWithFormData(formQParams, formName) {
    let params = new URLSearchParams(window.location.search);
    const externalParams = new URLSearchParams();
    for(const [key, value] of params.entries()) {
        if(formName !== undefined && !key.startsWith(formName + '.')) {
            externalParams.set(key, value);
        }
    }
    params = externalParams;
    for(const [key, value] of formQParams.entries()) {
        if(value) {
            params.set(key, value);
        }
    }
    let paramsString = '?' + params.toString();
    if(paramsString === '?') {
        paramsString = '';
    }
    if(paramsString !== prevParamsString) {
        console.debug(`changing url search params to '${paramsString}'`);
        window.history.pushState({}, null, `${window.location.origin}${window.location.pathname}${paramsString}`);
        prevParamsString = paramsString;
    }
}

function fillFormsWithUrlParams() {
    console.debug('filling forms with QParams');
    const qparams = new URLSearchParams(window.location.search);
    for(const entry of f2fRegistry) {
        fillForm(entry.paramGroup, qparams);
    }
}

function fillFormItem(qparams, param, path) {
    if(param instanceof ParamGroup) {
        path.push(param.name);
        for(const childParam of param.paramList) {
            fillFormItem(qparams, childParam, path);
        }
        path.pop();
    }
    else {
        const key = [...path, param.name].join('.');
        const value = qparams.get(key);
        param.widget.write(key, value)
    }
}

function fillForm(paramGroup, qparams) {
    // fills the form's HTML elements with data from a URLSearchParams object
    let path = paramGroup.name === undefined ? []: [paramGroup.name];
    for(const param of paramGroup.paramList) {
        fillFormItem(qparams, param, path);
    }
}

//=[ Global Event Listeners ]===================================================

// window.addEventListener('popstate', fillFormsWithUrlParams);
// window.addEventListener('pushstate', fillFormsWithUrlParams);
