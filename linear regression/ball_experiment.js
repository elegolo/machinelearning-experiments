"use strict"; // jshint ignore: line 

// Canvas and visualisation related constants
const _CANVAS_WIDTH = 1400;
const _CANVAS_HEIGHT = 800;
const _SHAPE_SCALING = 100;
const _SHAPE_PADDING = 200;

// Physics related constants
const _WHEEL_STEP = 20;
const _BALL_RADIUS = 40;
const _BALL_MASS = 50;
const _BALL_ELASTICITY = 0.4; // Ball can contract itself to (1 - _BALL_ELASTICITY) * size
const _BALL_FRICTION = 0.9;
const _GAME_GRAVITY = 0.1;
const _SPRING_MAX_THRESHOLD = 25;
const _SPRING_AIR_FRICTION = 3.5;
const _NORMAL_AIR_FRICTION = 0.001;
const _K = 0.08;

const X = 0, Y = 1;

// Brain hyperparameters
var _epochs = 51;
var _dropout = false;
var _recurrent = false;

const  _params = {
    libURI: "http://localhost/machinelearning/lib/neural-network.js",
    lr: 0.05,
    layers: _recurrent ? [102, 10, 5, 2] : [100, 5, 2] ,
    // layers: [4, 6, 6, 4, 4, 2],
    // layers: [6, 6, 5, 4, 3, 2, 2],
    optimizer: "adagrad",
    optimizerParams: {alpha: 0.85, beta1: 0.9, beta2: 0.99}, // 0.9 decay for adadelta
    activation: "prelu",
    activationParams: {alpha: 0.1}
};

//////////////////////////////////////////////

var Ball = function(params) {
    
    params = params || {};

    this.pos = [params.x || 0, params.y || 0];
    this.vel = [0, 0];
    this.acc = [0, 0];

    this.radius = params.radius || _BALL_RADIUS;
    this.mass = params.mass || _BALL_MASS;
    this.elasticity = params.elasticity || _BALL_ELASTICITY;
    this.friction = params.friction || _BALL_FRICTION;
    this.contraction = 0;

    if (!this.mass)
        console.error("ERROR: invalid ball's mass", {ball: this});
};

Ball.prototype.gravity = function(angle) {

    return [_GAME_GRAVITY * Math.cos(angle) / this.mass, _GAME_GRAVITY * Math.sin(angle) / this.mass];
};

Ball.prototype.update = function(dt, follow) {

    // NF are forces that applies but we don't want into our acceleration
    var F = [0, 0], gravity = this.gravity(mouse.wheel);
    var add_acc = [0, 0], add_vel = [0, 0];

    // Add spring force between mouse and ball
    if (follow)
    {
        var l0 = Math.sqrt( (mouse.x - this.pos[X]) * (mouse.x - this.pos[X]) + (mouse.y - this.pos[Y]) * (mouse.y - this.pos[Y]));
        var f = -_K * (this.radius - l0);

        if (this.radius - l0 <= 0)
        {
            F[X] += f * (mouse.x - this.pos[X]) / l0 - _SPRING_AIR_FRICTION * this.vel[X];
            F[Y] += f * (mouse.y - this.pos[Y]) / l0 - _SPRING_AIR_FRICTION * this.vel[Y];

            // Apply threshold (to avoid really high forces, especially when dt drops down)
            F[X] = Math.abs(F[X]) >= _SPRING_MAX_THRESHOLD ? (F[X] > 0 ? _SPRING_MAX_THRESHOLD : -_SPRING_MAX_THRESHOLD) : F[X];
            F[Y] = Math.abs(F[Y]) >= _SPRING_MAX_THRESHOLD ? (F[Y] > 0 ? _SPRING_MAX_THRESHOLD : -_SPRING_MAX_THRESHOLD) : F[Y];
        }
    }

    // Pre-computing new movement for knowing position
    var acc = [this.acc[X], this.acc[Y]];
    var vel = [this.vel[X], this.vel[Y]];
    var pos = [this.pos[X], this.pos[Y]];

    for (var i = 0; i < 2; i ++)
    {
        acc[i] = F[i] / this.mass + gravity[i];
        vel[i] += acc[i] * dt;
        pos[i] += vel[i] * dt;
    }

    var limX = _CANVAS_WIDTH / 2 - this.radius;
    var limY = _CANVAS_HEIGHT / 2 - this.radius;
    var tmp = [this.vel[X], this.vel[Y]];

    // Bouncing
    if (this.pos[Y] >= limY) { // top
        tmp[Y] *= -this.elasticity;
        this.pos[Y] -= this.pos[Y] - limY;
    } else if (this.pos[Y] <= -limY) { // bottom
        tmp[Y] *= -this.elasticity;
        this.pos[Y] -= this.pos[Y] + limY;
    }
    
    if (this.pos[X] >= limX) { // left
        tmp[X] *= -this.elasticity;
        this.pos[X] -= this.pos[X] - limX;
    } else if (this.pos[X] <= -limX) { // right
        tmp[X] *= -this.elasticity;
        this.pos[X] -= this.pos[X] + limX;
    }

    // Apply new values
    this.vel[X] = tmp[X];
    this.vel[Y] = tmp[Y];

    for (i = 0; i < 2; i ++)
    {
        this.acc[i] = acc[i] + add_acc[i];
        this.vel[i] += this.acc[i] * dt;
        this.pos[i] += this.vel[i] * dt;
    }
};

function euclidian_distance(x, y) {
    return Math.sqrt( x*x + y*y );
}

function normalize(x) {
    var k = 2.5; // seems that this value could be cool
    x *= k;
    return x >= 0 ? 1 - 1 / ((x + 1) * (x + 1)) : -1 + 1 / ((x - 1) * (x - 1));
}

function unormalize(x) {
    var k = 2.5;
    return (x >= 0 ? Math.sqrt(1 / (1 - x)) - 1 : -Math.sqrt(1 / (1 + x)) + 1) * 1 / k;
}

function normalize_gravity(gravity_vector) {

    var norm = Math.sqrt( (gravity_vector[X]*gravity_vector[X]) + (gravity_vector[Y]*gravity_vector[Y]) );
    var x = gravity_vector[X] / norm;
    var y = gravity_vector[Y] / norm;

    return [x, y];
}

function filter(x) {
    if (x > 1.2)
        return 1.2;
    else if (x < -1.2)
        return -1.2;
    else
        return x;
}

//////////////////////////////////////////////

function init() {

    DOM.playground.width = _CANVAS_WIDTH;
    DOM.playground.height = _CANVAS_HEIGHT;

    ctx.translate(_CANVAS_WIDTH / 2, _CANVAS_HEIGHT / 2);
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.6;    

    DOM.playground.addEventListener("mousedown", function(e) {

        e.preventDefault();
        e.stopPropagation();

        mouse.click = true;
    }); 
    
    DOM.playground.addEventListener("mouseup", function(e) {

        e.preventDefault();
        e.stopPropagation();

        mouse.click = false;
    });

    DOM.playground.addEventListener("mouseout", function(e) {
        
        e.stopPropagation();
        e.preventDefault();
        
        mouse.click = false;
    });

    DOM.playground.addEventListener("mousemove", function(e) {

        e.preventDefault();
        e.stopPropagation();

        mouse.x = (e.pageX - DOM.playground.offsetLeft) * 2 - _CANVAS_WIDTH / 2;
        mouse.y = (e.pageY - DOM.playground.offsetTop) * -2 + _CANVAS_HEIGHT / 2;
    });

    DOM.playground.addEventListener("wheel", function(e) {

        e.preventDefault();

        // Firefox deltaY returns lines instead of pixels
        var delta = e.deltaMode !== 0x00 ? e.deltaY * 40 : e.deltaY;
        delta += Math.random() * 2 - 1; // we provide "salt" to have different values for training
        
        mouse.wheel += delta / _WHEEL_STEP / 180 * Math.PI;
    });

    window.addEventListener("keydown", function(e) {
        
        if (e.keyCode === 32) // spacebar
        {
            e.stopPropagation();
            e.preventDefault();
            DOM.backpropagationCheckbox.click();
        }
    });

    DOM.trainButton.addEventListener("click", function(e) {
        
        // Initial training
        if (typeof training_data_imported !== 'undefined' && training_data_imported !== undefined)
        {
            DOM.trainButton.parentElement.appendChild(brain.train({
                data: Utils.static.parseTrainingData(training_data_imported),
                epochs: _epochs,
                visualize: true,
                recurrent: _recurrent,
                dropout: _dropout,
            }));
        }
        else  {
            alert("No training data available");
        }
    });

    DOM.dropoutButton.addEventListener("click", function (e) {
        brain.dropout(false);
    });
}

function update() {

    if (safe !== true) {
        console.info("Script successfully stopped");
        return;
    }

    requestAnimationFrame(function() { update(); });

    var now = Date.now(), dt = now - time;
    var gravity = ball.gravity(mouse.wheel);

    dt = dt > 50 ? 50 : dt; // temporary fix for bouncing due to changing tab

    // Update ball coords at high frqency
    time = now;
    ball.update(dt, mouse.click);

    //////////////////////////////////////////

    // Feedforward NN
    try {

        // Build inputs / targets
        var normalized_ball_acc = [normalize(ball.acc[X]), normalize(ball.acc[Y])];
        var diff = [normalized_ball_acc[0] - prev_ball_acc[0], normalized_ball_acc[1] - prev_ball_acc[1]]; // should we normalize these ones? I guess not they are really small
        prev_ball_acc = normalized_ball_acc;

        // If we don't apply a threshold, our values can go exponentially up on non-correctly trained NN
        var outputs_to_inputs = [filter(brain.output[X]), filter(brain.output[Y])]; // usefull if recurrent NN

        if (saved_inputs.length >= saved_inputs_max_size) 
            saved_inputs.splice(0, 2);

        saved_inputs.push(normalized_ball_acc[X], normalized_ball_acc[Y]);

        if (saved_inputs.length !== saved_inputs_max_size)
            return;

        var inputs = saved_inputs;
        // var inputs = ball_acc.concat(diff);
        var inputs_n_recurrence = _recurrent ? inputs.concat(outputs_to_inputs) : inputs;

        var normalized_g = normalize_gravity(gravity); // values € [-1, 1]
        var targets = [normalized_g[X], normalized_g[Y]];
        
        // Feeforward NN with normalized inputs
        var neurons = brain.feed(inputs_n_recurrence);
        // outputs = [unormalize(neurons[X].output), unormalize(neurons[Y].output)];
        outputs = brain.output;
        var output_x = outputs[X];
        var output_y = outputs[Y];
        
        // Build training data (as string) for future exportation
        // Get rid of redondant data by checking difference from the last ball acceleration
        // if ((diff[X] !== 0 && diff[Y] !== 0) || mouse.click === true) {
        if (DOM.saveDataCheckbox.checked) {
            Utils.static.addIntoTraining(inputs, targets);
            console.log("building training data", Utils.trainingSize );
        }

        // } else if (mouse.click) {
            // console.log("dammit, we lose data");
        // }

        if (DOM.backpropagationCheckbox.checked === true)
            brain.backpropagate(targets);

    } catch(ex) {
        safe = false;
        console.error(ex);
        return;
    }

    // Update global error display
    DOM.globalError.innerHTML = (brain.globalError * _CANVAS_WIDTH).toFixed(6);
    
    // Update Network SVG Vizualisation
    // brain.visualize(inputs_n_recurrence, 4);

    //////////////////////////////////////////
    
    ctx.clearRect(-_CANVAS_WIDTH / 2, -_CANVAS_HEIGHT / 2, _CANVAS_WIDTH, _CANVAS_HEIGHT);

    var d1 = euclidian_distance(gravity[X], gravity[Y]), d2 = euclidian_distance(ball.acc[X], ball.acc[Y]);

    // Draw gravity
    ctx.save();
    ctx.fillStyle = "#638fd4";
    ctx.rotate(-Math.atan2(gravity[X], gravity[Y]));
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(0, _SHAPE_SCALING * d1 + _SHAPE_PADDING);
    ctx.lineTo(10, 0);
    ctx.fill();
    ctx.restore();

    // Draw ball acceleration
    ctx.save();
    ctx.fillStyle = "#C97373";
    ctx.rotate(-Math.atan2(ball.acc[X], ball.acc[Y]));
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(0, _SHAPE_SCALING * d2 + (d1 > d2 ? _SHAPE_PADDING * d2 / d1 : _SHAPE_PADDING) );
    ctx.lineTo(10, 0);
    ctx.fill();
    ctx.restore();

    
    // Draw output gravity
    var d3 = euclidian_distance(output_x, output_y);

    ctx.save();
    ctx.fillStyle = "purple";
    ctx.rotate(-Math.atan2(output_x, output_y));
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(0, _SHAPE_SCALING * d3 + _SHAPE_PADDING );
    ctx.lineTo(10, 0);
    ctx.fill();
    ctx.restore();   

    // Draw ball
    ctx.beginPath();
    ctx.arc(ball.pos[X], ball.pos[Y], ball.radius, 0, Math.PI * 2, false);
    ctx.stroke();

    // Update acceleration output
    DOM.accelerationOutputs[0].innerHTML = ball.acc[X].toFixed(4) + " / " + ball.acc[Y].toFixed(4);
    DOM.accelerationOutputs[1].innerHTML = normalized_ball_acc[X].toFixed(4) + " / " + normalized_ball_acc[Y].toFixed(4);

    // Update gravity output
    DOM.gravityOutputs[0].innerHTML = gravity[X].toFixed(4) + " / " + gravity[Y].toFixed(4);
    DOM.gravityOutputs[1].innerHTML = normalized_g[X].toFixed(4) + " / " + normalized_g[Y].toFixed(4);
}

var safe = true, DOM, ctx, mouse, ball, brain, time;
var outputs = [0, 0];
var prev_ball_acc = [0, 0];

var saved_inputs = [];
var saved_inputs_max_size = 100; // has to be multiple of two.  

window.onload = function() {

    DOM = {
        playground: document.querySelector("#playground"),
        accelerationOutputs: document.querySelectorAll("#acceleration_outputs span"),
        gravityOutputs: document.querySelectorAll("#gravity_outputs span"),
        globalError: document.querySelector("#global_error span"),
        backpropagationCheckbox: document.querySelector("#backpropagate"),  
        saveDataCheckbox: document.querySelector("#save_data"),  
        trainButton: document.querySelector("#train"),
        dropoutButton: document.querySelector("#dropout"),
    };

    ctx = DOM.playground.getContext("2d");

    time = Date.now();
    mouse = {x: 1, y: 2, click: false, wheel: -Math.PI/2};
    ball = new Ball();
    brain = new Network(_params);
    
    ///////////////////////////////////////////

    document.body.appendChild( brain.createVisualization() );

    init();
    update();

};

/* TODO
    -
*/

safe = true;// avoid update