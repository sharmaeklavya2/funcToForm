// Copyright (C) 2023 Eklavya Sharma. Licensed under GNU GPLv3.

'use strict';

function compose(f, g) {
    return function(x) {
        return f(g(x));
    }
}

var svgNS = 'http://www.w3.org/2000/svg';
var debugInfo = {'input': null, 'output': null};
var laneNameToType = {'log': 'div', 'break': 'div', 'svg': 'svg'};

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
    if(isNaN(s)) {
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
            throw new InputError(x + ' should be ≥ ' + thresh);
        }
        return x;
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

    create(idPrefix) {
        const inputElem = document.createElement('input');
        inputElem.setAttribute('id', idPrefix + '.input');
        inputElem.setAttribute('type', this.type);
        inputElem.setAttribute('name', idPrefix);
        inputElem.setAttribute('autocomplete', 'off');
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

    log(msg) {
        this.setLane('log');
        const logLineElem = document.createElement('div');
        logLineElem.classList.add('f2f-log-line');
        const strArgs = Array.from(arguments).map(x => '' + x);
        logLineElem.innerHTML = strArgs.join(' ');
        this.laneElem.appendChild(logLineElem);
    }

    addBreak() {
        this.setLane('break');
    }

    rawAdd(elem) {
        this.laneElem.appendChild(elem);
    }

    clear() {
        this.laneName = null;
        this.laneElem = null;
        this.streamElem.innerHTML = '';
    }
}

function createForm(wrapperId, paramGroup, func) {
    const wrapperElem = document.getElementById(wrapperId);
    const formElem = document.createElement('form');
    const formName = `f2f.${paramGroup.name}`;
    formElem.setAttribute('action', 'javascript:void(0);');
    formElem.setAttribute('id', `${formName}.form`);
    let path = [formName];
    for(const param of paramGroup.paramList) {
        createFormItem(formElem, param, path);
    }
    const submitButton = document.createElement('button');
    submitButton.setAttribute('type', 'submit');
    submitButton.innerHTML = 'Run';
    formElem.appendChild(submitButton);
    const formErrorElem = document.createElement('div');
    formErrorElem.classList.add('f2f-error');
    formErrorElem.setAttribute('id', `${formName}.error`);
    wrapperElem.appendChild(formElem);
    wrapperElem.appendChild(formErrorElem);
    const stdout = new Ostream('stdout', wrapperElem);
    debugInfo['stdout'] = stdout;
    formElem.addEventListener('submit', function(ev) {
        const formData = new FormData(formElem);
        const [input, status] = readForm(paramGroup, formData);
        debugInfo.input = input;
        if(status) {
            try {
                const output = func(input, stdout);
                debugInfo.output = output;
                if(output !== undefined) {
                    stdout.log(output);
                }
            }
            catch (error) {
                formErrorElem.innerHTML = error.toString();
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
            if(error instanceof InputError && errorsElem) {
                const errorElem = document.createElement('div');
                errorElem.classList.add('f2f-error');
                errorElem.innerHTML = error.message;
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
    return [output, globalOk];
}
