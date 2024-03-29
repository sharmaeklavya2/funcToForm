// Copyright (C) 2023 Eklavya Sharma. Licensed under GNU GPLv3.

'use strict';

function compose(...args) {
    return function(x) {
        let y = x;
        for(const f of args.toReversed()) {
            y = f(y);
        }
        return y;
    }
}

const svgNS = 'http://www.w3.org/2000/svg';
const debugInfo = {'input': null, 'output': null};
const laneNameToType = {'log': 'div', 'break': 'div', 'misc': 'div',
    'svg': 'svg', 'table': 'table'};
const f2fRegistry = [];
let prevParamsString = window.location.search;

//=[ Converters and Validators ]================================================

class InputError extends Error {
    constructor(message) {
        super(message);
        this.name = "InputError";
    }
}

function toInt(s) {
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

function toFloat(s) {
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

function assertGE(thresh) {
    return function(x) {
        if(x < thresh) {
            throw new InputError(x + ' is not ≥ ' + thresh);
        }
        return x;
    }
}

function assertLE(thresh) {
    return function(x) {
        if(x > thresh) {
            throw new InputError(x + ' is not ≤ ' + thresh);
        }
        return x;
    }
}

function assertInRange(lo, hi) {
    return function(x) {
        if(x < lo || x > hi) {
            throw new InputError(x + ` is not in range [${lo}, ${hi}]`);
        }
        return x;
    }
}

function matrixConv(outSep, inSep, converter=null) {
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

function listConv(sep, converter=null) {
    return function(s) {
        let parts = s.split(sep);
        if(converter === null) {
            return parts;
        }
        else {
            return parts.map(converter);
        }
    }
}

//=[ Widgets and Params ]=======================================================

class TextWidget {
    constructor(converter=null, required=true, defVal=null, defStr=null, type='text') {
        this.converter = converter;
        this.defVal = defVal;
        if(defStr === null && (typeof defVal === 'string' || defVal instanceof String)) {
            this.defStr = defVal;
        }
        else {
            this.defStr = defStr || '';
        }
        this.defStr = defStr;
        this.required = (defVal ? false : required);
        this.type = type;
    }

    read(key, value) {
        if(value) {
            return ((this.converter === null) ? value : this.converter(value));
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

    create(idPrefix) {
        let inputElem = null;
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
            inputElem.setAttribute('placeholder', this.defStr);
        }
        return inputElem;
    }
}

class CheckBoxWidget {
    constructor(defVal=false) {
        this.defVal = defVal;
    }

    read(key, value) {
        return Boolean(value);
    }

    write(key, value) {
        const elem = document.getElementById(key + '.input');
        elem.checked = Boolean(value);
    }

    create(idPrefix, name, description) {
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

class SelectOption {
    constructor(name, value=null, text=null) {
        this.name = name;  // name used by browser when submitting form
        this.value = ((value === null) ? name : value);  // value passed to our function
        this.text = ((text === null) ? name : text);  // text displayed in UI
    }
}

class SelectWidget {
    constructor(options, defName=null) {
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

    create(idPrefix, name, description) {
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
            optionElem.innerHTML = option.text;
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
}

function isValidParamName(s) {
    // return /^[a-zA-Z_][0-9a-zA-Z_]*$/.test(s);
    return true;
}

class Param {
    constructor(name, widget=null, label=null, description=null) {
        this.name = name;
        this.label = (label === null ? name : label);
        if(!isValidParamName(name)) {
            throw new Error('Invalid parameter name ' + name);
        }
        this.widget = widget
        this.description = description;
    }
}

class ParamGroup {
    constructor(name, paramList, converter=null, description=null) {
        this.name = name;
        if(!isValidParamName(name)) {
            throw new Error('Invalid parameter name ' + name);
        }
        this.paramList = paramList;
        this.description = description;
        this.converter = converter;
        let seenNames = new Set();
        for(const param of paramList) {
            if(seenNames.has(param.name)) {
                throw new Error('Parameter name ' + param.name + ' already used');
            }
            seenNames.add(param.name);
        }
    }
}

function createFormItem(outerElem, param, path) {
    if(param instanceof ParamGroup) {
        throw new Error('createFormItem: ParamGroup not implemented.')
    }
    else {
        const idPrefix = path.join('.') + '.' + param.name;
        const owrapperElem = document.createElement('div');
        owrapperElem.setAttribute('id', idPrefix + '.owrap');
        owrapperElem.classList.add('inputOwrap');
        const iwrapperElem = document.createElement('div');
        iwrapperElem.classList.add('inputIwrap');
        iwrapperElem.setAttribute('id', idPrefix + '.iwrap');
        owrapperElem.appendChild(iwrapperElem);
        const labelElem = document.createElement('label');
        labelElem.setAttribute('for', idPrefix + '.input');
        labelElem.innerHTML = param.label;
        let helpBtn = null;
        if(param.description) {
            helpBtn = document.createElement('div');
            helpBtn.classList.add('f2f-help-btn');
        }
        const inputElem = param.widget.create(idPrefix);
        if(param.widget instanceof CheckBoxWidget) {
            iwrapperElem.appendChild(inputElem);
            iwrapperElem.appendChild(labelElem);
            if(helpBtn !== null) {
                iwrapperElem.appendChild(helpBtn);
            }
        }
        else {
            iwrapperElem.appendChild(labelElem);
            if(helpBtn !== null) {
                iwrapperElem.appendChild(helpBtn);
            }
            iwrapperElem.appendChild(inputElem);
        }
        if(param.description) {
            const helpElem = document.createElement('div');
            helpElem.classList.add('f2f-help-str');
            helpElem.classList.add('hidden');
            helpElem.innerHTML = param.description;
            owrapperElem.appendChild(helpElem);
            helpBtn.addEventListener('click', function(ev) {
                helpElem.classList.toggle('hidden');
            });
        }
        const errorsElem = document.createElement('div');
        errorsElem.setAttribute('id', idPrefix + '.errors');
        errorsElem.classList.add('f2f-errors');
        owrapperElem.appendChild(errorsElem);
        outerElem.appendChild(owrapperElem);
    }
}

class Ostream {
    constructor(name, wrapperElem) {
        this.name = name;
        this.wrapperElem = wrapperElem;
        this.streamElem = document.createElement('div');
        this.streamElem.setAttribute('id', `f2f.${name}`);
        this.streamElem.classList.add('f2f-ostream');
        wrapperElem.appendChild(this.streamElem);
        this.laneName = null;
        this.laneElem = null;
    }

    clear() {
        this.laneName = null;
        this.laneElem = null;
        this.streamElem.innerHTML = '';
    }

    setLane(name, attrs=null) {
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
            if(attrs !== null) {
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
        logLineElem.innerHTML = strArgs.join(' ');
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

function createForm(wrapperId, paramGroup, func, clearOutput=true) {
    const formName = `f2f.${paramGroup.name}`;
    const registryEntry = {'wrapperId': wrapperId, 'paramGroup': paramGroup,
        'formName': formName, 'func': func, 'clearOutput': clearOutput};
    f2fRegistry.push(registryEntry);
    const wrapperElem = document.getElementById(wrapperId);
    const formElem = document.createElement('form');
    formElem.setAttribute('id', `${formName}.form`);
    let path = [formName];
    for(const param of paramGroup.paramList) {
        createFormItem(formElem, param, path);
    }
    const submitButton = document.createElement('button');
    submitButton.setAttribute('type', 'submit');
    submitButton.innerHTML = 'Run';
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
                if(clearOutput) {
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

function readFormItem(formData, output, param, path) {
    if(param instanceof ParamGroup) {
        throw new Error('readFormItem: ParamGroup not implemented.')
    }
    else {
        const key = path.join('.') + '.' + param.name;
        const value = formData.get(key);
        const errorsElem = document.getElementById(key + '.errors');
        if(errorsElem) {
            errorsElem.innerHTML = '';
        }
        try {
            output[param.name] = param.widget.read(key, value);
            return true;
        }
        catch (error) {
            if(error instanceof Error && errorsElem) {
                const errorElem = document.createElement('div');
                errorElem.classList.add('f2f-error');
                errorElem.innerHTML = (error instanceof InputError ? '' : error.name + ': ') + error.message;
                errorsElem.appendChild(errorElem);
                return false;
            }
            else {
                throw error;
            }
        }
    }
}

function readForm(paramGroup, formData) {
    let path = [`f2f.${paramGroup.name}`];
    let output = {};
    let globalOk = true;
    for(const param of paramGroup.paramList) {
        const localOk = readFormItem(formData, output, param, path);
        if(!localOk) {
            globalOk = false;
        }
    }
    if(globalOk) {
        updateLocationWithFormData(formData, path[0] + '.');
    }
    return [output, globalOk];
}

//=[ URL Query Param Handling ]=================================================

function updateLocationWithFormData(formData, prefixToChange) {
    let params = new URLSearchParams(window.location.search);
    const externalParams = new URLSearchParams();
    for(const [key, value] of params.entries()) {
        if(!key.startsWith(prefixToChange)) {
            externalParams.set(key, value);
        }
    }
    params = externalParams;
    for(const [key, value] of formData.entries()) {
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
        throw new Error('fillFormItem: ParamGroup not implemented.')
    }
    else {
        const key = path.join('.') + '.' + param.name;
        const value = qparams.get(key);
        param.widget.write(key, value)
    }
}

function fillForm(paramGroup, qparams) {
    let path = [`f2f.${paramGroup.name}`];
    for(const param of paramGroup.paramList) {
        fillFormItem(qparams, param, path);
    }
}

//=[ Global Event Listeners ]===================================================

window.addEventListener('popstate', fillFormsWithUrlParams);
window.addEventListener('pushstate', fillFormsWithUrlParams);
