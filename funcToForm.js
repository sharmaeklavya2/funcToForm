// Copyright (C) 2023 Eklavya Sharma. Licensed under GNU GPLv3.

'use strict';

function compose(f, g) {
    return function(x) {
        return f(g(x));
    }
}

var debugInfo = {'input': null, 'output': null};
var laneNameToType = {'log': 'div', 'break': 'div'};

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
    constructor(converter=null, required=true, defVal=null, type='text') {
        this.converter = converter;
        this.defVal = defVal;
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

    create(idPrefix, name, description) {
        const wrapperElem = document.createElement('div');
        wrapperElem.setAttribute('id', idPrefix + '.wrap');
        wrapperElem.classList.add('inputWrap');
        const labelElem = document.createElement('label');
        labelElem.setAttribute('for', idPrefix + '.input');
        labelElem.innerHTML = name;
        wrapperElem.appendChild(labelElem);
        const inputElem = document.createElement('input');
        inputElem.setAttribute('id', idPrefix + '.input');
        inputElem.setAttribute('type', this.type);
        inputElem.setAttribute('name', idPrefix);
        inputElem.setAttribute('autocomplete', 'off');
        if(this.required) {
            inputElem.setAttribute('required', 'required');
        }
        if(this.defVal) {
            inputElem.setAttribute('placeholder', this.defVal);
        }
        wrapperElem.appendChild(inputElem);
        return wrapperElem;
    }
}

class CheckBoxWidget {
    read(key, value) {
        return Boolean(value);
    }

    create(idPrefix, name, description) {
        const wrapperElem = document.createElement('div');
        wrapperElem.setAttribute('id', idPrefix + '.wrap');
        wrapperElem.classList.add('inputWrap');
        const inputElem = document.createElement('input');
        inputElem.setAttribute('id', idPrefix + '.input');
        inputElem.setAttribute('type', 'checkbox');
        inputElem.setAttribute('name', idPrefix);
        wrapperElem.appendChild(inputElem);
        const labelElem = document.createElement('label');
        labelElem.setAttribute('for', idPrefix + '.input');
        labelElem.innerHTML = name;
        wrapperElem.appendChild(labelElem);
        return wrapperElem;
    }
}

class SelectOption {
    constructor(name, value, text=null) {
        this.name = name;
        this.value = value;
        this.text = ((text === null) ? name : text);
    }
}

class SelectWidget {
    constructor(options) {
        this.options = options;
    }
}

function isValidParamName(s) {
    // return /^[a-zA-Z_][0-9a-zA-Z_]*$/.test(s);
    return true;
}

class Param {
    constructor(name, widget=null, description=null) {
        this.name = name;
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
        let elem = param.widget.create(idPrefix, param.name, param.description);
        outerElem.appendChild(elem);
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

    setLane(name) {
        if(name === this.laneName) {
            return;
        }
        const laneType = laneNameToType[name];
        if(laneType) {
            this.laneName = name;
            this.laneElem = document.createElement(laneType);
            this.laneElem.classList.add('f2f-lane-' + name);
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
        logLineElem.innerHTML = '' + msg;
        this.laneElem.appendChild(logLineElem);
    }

    addBreak() {
        this.setLane('break');
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
    wrapperElem.appendChild(formElem);
    const stdout = new Ostream('stdout', wrapperElem);
    formElem.addEventListener('submit', function(ev) {
        let formData = new FormData(formElem);
        let input = readForm(paramGroup, formData);
        debugInfo.input = input;
        let output = func(input, stdout);
        debugInfo.output = output;
        if(output !== undefined) {
            stdout.log(output);
        }
        stdout.addBreak();
    });
}

function readFormItem(formData, output, param, path) {
    if(param instanceof ParamGroup) {
        throw new Error('readFormItem: ParamGroup not implemented.')
    }
    else {
        const key = path.join('.') + '.' + param.name;
        const value = formData.get(key);
        output[param.name] = param.widget.read(key, value);
    }
}

function readForm(paramGroup, formData) {
    let path = [`f2f.${paramGroup.name}`];
    let output = {};
    for(const param of paramGroup.paramList) {
        readFormItem(formData, output, param, path);
    }
    return output;
}
