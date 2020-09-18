// params
var ROWINTERVAL = 1;   // check every nth row for a finder pattern. 1 = slowest but most comprehensive
var MAXVARIANCE = 0.5; // allowable variation/distortion in each segment of observed pattern shape, as proportion of width of black border
var DEDUPDISTANCE = 10; // pattern centers closer together than this (in pixels) are considered duplicates
var SWATCHSTARTPOS = new Point(0.210, -0.070); // position of leftmost swatch, expressed as x = multiple of TL->TR vector and y = multiple of TL->BL vector
var SWATCHSPACING = 0.116; // spacing of swatches, expressed as x = multiple of TL->TR vector
var SWATCHCOLORRADIUS = 0.028; // radius of color sampling region around center of each swatch, expressed as multiple of TL->TR vector
var NSWATCHES = 6;
var SAMPLESTARTPOS = new Point(0.248, 0.524); // position of leftmost sample, expressed as x = multiple of TL->TR vector and y = multiple of TL->BL vector
var SAMPLESPACING = 0.250; // spacing of samples, expressed as x = multiple of TL->TR vector
var NSAMPLES = 3;
var SAMPLECOLORRADIUS = 0.038; // radius of color sampling region around center of each sample, expressed as multiple of TL->TR vector
var MINGREENINCREMENT = 4;     // minimum difference in green color channel value between adjacent swatches to count as a valid color reference
var MAXGREENINCVARIANCE = 9;   // maximum deviation from mean in the difference between any two adjacent swatches' green channels
var MINPNGREENDIFF = 12;       // minimum difference in positive and negative control green channel before likely no reaction

/* 
in sample image:
TL->TR = 505px (width)
TL->BL = 154px (height)

swatch start position is 102px right, 12px up of TL
swatch 2 is 58px right of swatch 1

sample start position is 125px right, 81px down of TL
sample 2 is 125px right of sample 1
*/

var canvas = document.getElementById('imageCanvas');
var ctx = canvas.getContext('2d');

function sum(array) {
    return array.reduce(function(acc, val) { return acc + val; }, 0);
}

// Point object for coordinates on a canvas
function Point(x, y) {
    this.x = x;
    this.y = y;
}

// RGB object for color value of a point
function RGB(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
}

function distance(a, b) {
    return Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
}

function checkNotDuplicate(point, foundPatterns) {
    for (var i = 0; i < foundPatterns.length; i++)
        if (distance(point, foundPatterns[i]) <= DEDUPDISTANCE)
            return false;
    return true;
}

function checkHorizontalRatio(stateCount, moduleSize) {
    var variance = moduleSize * MAXVARIANCE;
    return Math.abs(stateCount[0] - moduleSize) < variance &&
           Math.abs(stateCount[1] - moduleSize) < variance &&
           Math.abs(stateCount[2] - moduleSize * 3) < variance * 3 &&
           Math.abs(stateCount[3] - moduleSize) < variance &&
           Math.abs(stateCount[4] - moduleSize) < variance;
}

function checkAux(direction, bindata, width, centerpoint, moduleSize) {
    var stateCount = [0, 0, 0];
    var currentState = 0;
    var x = centerpoint.x;
    var y = centerpoint.y;
    while (currentState < 3) {
        if (y < 0 || y >= bindata.length / width || x < 0 || x >= width)
            return false; // out of bounds
        var pos = width * y + x;
        if (bindata[pos] == 'b') {
            if (currentState == 1)
                currentState++;
        } else { // encountered 'w'
            if (currentState == 0 || currentState == 2)
                currentState++;
        }
        if (currentState < 3)
            stateCount[currentState]++;
        switch (direction) {
            case 'up':
                y--; break;
            case 'down':
                y++; break;
            case 'up-left':
                y--; x--; break;
            case 'down-right':
                y++; x++; break;
        }
    }
    var variance = moduleSize * MAXVARIANCE;
    if (!(Math.abs(stateCount[0] - moduleSize * 1.5) < variance * 1.5 &&
        Math.abs(stateCount[1] - moduleSize) < variance &&
        Math.abs(stateCount[2] - moduleSize) < variance))
        return false;
    if (direction == 'up' || direction == 'down') {
        return sum(stateCount);
    }
    return true;
}

function checkVerticalAndAdjust(bindata, width, centerpoint, moduleSize) {
    var uplength = checkAux('up', bindata, width, centerpoint, moduleSize);
    var downlength = checkAux('down', bindata, width, centerpoint, moduleSize);
    if (uplength === false || downlength === false)
        return -1;
    var adjustedY = centerpoint.y + ((downlength - uplength) / 2);
    return new Point(centerpoint.x, adjustedY);
}

// function checkDiagonalRatio(bindata, width, centerpoint, moduleSize) {
//     return true;
//     return checkAux('up-left', bindata, width, centerpoint, moduleSize * Math.sqrt(2)) &&
//            checkAux('down-right', bindata, width, centerpoint, moduleSize * Math.sqrt(2));
// }

function processPotentialPattern(bindata, row, width, pos, stateCount, foundPatterns) {
    for (var i = 0; i < 5; i++)
        if (stateCount[i] == 0)
            return; // any empty states means definitely invalid pattern
    var moduleSize = Math.round(sum(stateCount) / 7); // width of a "1" segment in 1:1:3:1:1
    var centerpoint = new Point((pos - Math.round(sum(stateCount) / 2)) % width, row);
    if (checkHorizontalRatio(stateCount, moduleSize)) {
        centerpoint = checkVerticalAndAdjust(bindata, width, centerpoint, moduleSize);
        if (centerpoint != -1 && checkNotDuplicate(centerpoint, foundPatterns)) {
            centerpoint = new Point(Math.round(centerpoint.x), Math.round(centerpoint.y)); // correct to int
            foundPatterns.push(centerpoint);
        }
    }
}

function shiftStatesBack(stateCount) {
    stateCount[0] = stateCount[2];
    stateCount[1] = stateCount[3];
    stateCount[2] = stateCount[4];
    stateCount[3] = 0;
    stateCount[4] = 0;
}

function checkRow(bindata, row, width, foundPatterns) {
    var stateCount = [0, 0, 0, 0, 0];
    var currentState = 0;
    for (var pos = row * width; pos < (row + 1) * width; pos++) {
        if (bindata[pos] == 'b') {
            if (currentState == 1 || currentState == 3)
                currentState++;
        } else { // encountered 'w'
            if (currentState == 0 || currentState == 2) {
                currentState++;
            } else if (currentState == 4) {
                processPotentialPattern(bindata, row, width, pos, stateCount, foundPatterns);
                shiftStatesBack(stateCount);
                currentState = 3;
            }
        }
        stateCount[currentState]++;
    }
}

// Takes three target points and returns them in bottom left, top left, and top right order
function arrangeTargets(pointA, pointB, pointC) {
    // distances between patterns
    var ab_distance = distance(pointA, pointB);
    var bc_distance = distance(pointB, pointC);
    var ac_distance = distance(pointA, pointC);
    var topright, topleft, bottomleft;
    // sort points by distance between them
    // +                              +
    // 
    // 
    // +
    if (ab_distance < bc_distance && ab_distance < ac_distance) {
        topright = pointC;
        if (ac_distance < bc_distance) {
            topleft = pointA;
            bottomleft = pointB;
        } else {
            topleft = pointB;
            bottomleft = pointA;
        }
    } else if (bc_distance < ab_distance && bc_distance < ac_distance) {
        topright = pointA;
        if (ab_distance < ac_distance) {
            topleft = pointB;
            bottomleft = pointC;
        } else {
            topleft = pointC;
            bottomleft = pointB;            
        }
    } else {
        topright = pointB;
        if (ab_distance < bc_distance) {
            topleft = pointA;
            bottomleft = pointC;
        } else {
            topleft = pointC;
            bottomleft = pointA;
        }
    }
    
    return [bottomleft, topleft, topright];
}

// extracts px data from canvas context, applies a threshold, and returns 1D array of 'b' or 'w' pixel values 
function getBinData(imageData, width, height) {
    var bindata = [];
    for (var j = 0; j < imageData.height; j++) {  
        for (var i = 0; i < imageData.width; i++) {
            var index = (j * 4) * imageData.width + (i * 4);
            var red = imageData.data[index];
            var green = imageData.data[index + 1];
            var blue = imageData.data[index + 2];
            // var alpha = imageData.data[index + 3];
            var average = (red + green + blue) / 3;
            bindata.push(average < 128 ? 'b' : 'w');
            // var bincolor = average < 128 ? 0 : 255;
            // imageData.data[index] = bincolor;
            // imageData.data[index + 1] = bincolor;
            // imageData.data[index + 2] = bincolor;
        }
    }
    // for(let i=0; i<100000; i++);
    // ctx.putImageData(imageData, 0, 0);
    return(bindata);
}

// retuns array of three Points indicating finder pattern positions [BL, TL, TR]
function locateFPs(imageData, width, height) {
	var bindata = getBinData(imageData, width, height);
    var foundPatterns = []; // authoritative list of non-duplicate finder patterns
    for (var row = 0; row < height; row += ROWINTERVAL) {
        checkRow(bindata, row, width, foundPatterns); // adds finder pattern to list if found and non-duplicate
    }
    if (foundPatterns.length != 3) {
        // console.log("Warning: did not find three finder patterns. Should advise user to take another, clearer picture of test");
        return -1;
    } else {
    	// console.log("bottomleft, topleft, topright:");
    	// console.log(arrangeTargets(foundPatterns[0], foundPatterns[1], foundPatterns[2]));
    	return arrangeTargets(foundPatterns[0], foundPatterns[1], foundPatterns[2]);
    }
}

// takes global coords of finder patterns and returns a 2x2 matrix (flattened) to linearly transform
// relative (FP ratio) positions into almost global positions. This does NOT include top left offset.
// (scales and rotates, but does not translate)
// |a b|  is returned as [a, b, c, d]
// |c d|
function getTransformMatrix(finderpatterns) {
	var c = finderpatterns[1]; // top left: offset for x/y values (does not translate)
	var i = finderpatterns[2]; // top right: x axis transformation
	var j = finderpatterns[0]; // bottom left : y axis transformation
	return [i.x - c.x, j.x - c.x, i.y - c.y, j.y - c.y];
}

// takes a relative point in FP ratio form, along with a transformation matrix and 
// top left position (for offset) and returns the true global position of that point
function transformFPpoint(fpPoint, transMat, topLeft) {
	return new Point(Math.round(transMat[0] * fpPoint.x + transMat[1] * fpPoint.y + topLeft.x),
		             Math.round(transMat[2] * fpPoint.x + transMat[3] * fpPoint.y + topLeft.y));
}

// // returns array of true pixel coordinates of each swatch
// function locateSwatches(transMat, topLeft) {
// 	var swatches = [];
// 	for (var i = 0; i < NSWATCHES; i++) {
// 		var swatchpos = new Point(SWATCHSTARTPOS.x + i * SWATCHSPACING, SWATCHSTARTPOS.y);
// 		swatches.push(transformFPpoint(swatchpos, transMat, topLeft));
// 	}
// 	return swatches;
// }

// // returns array of true pixel coordinates of each sample
// function locateSamples(transMat, topLeft) {
// 	var samples = [];
// 	for (var i = 0; i < NSAMPLES; i++) {
// 		var samplepos = new Point(SAMPLESTARTPOS.x + i * SAMPLESPACING, SAMPLESTARTPOS.y);
// 		samples.push(transformFPpoint(samplepos, transMat, topLeft));
// 	}
// 	return samples;
// }

// returns array of true pixel coordinates of each swatch or each sample, depending on type
function locateSwatchesOrSamples(transMat, topLeft, type) {
    var startpos = (type == 'SWATCH' ? SWATCHSTARTPOS : SAMPLESTARTPOS);
    var spacing = (type == 'SWATCH' ? SWATCHSPACING : SAMPLESPACING);
    var npoints = (type == 'SWATCH' ? NSWATCHES : NSAMPLES);
    var points = [];
    for (var i = 0; i < npoints; i++) {
        var pos = new Point(startpos.x + i * spacing, startpos.y);
        points.push(transformFPpoint(pos, transMat, topLeft));
    }
    return points;
}

// returns an RGB object color sample of the given point.
function colorSamplePoint(imageData, point) {
    var index = (point.y * 4) * imageData.width + (point.x * 4);
    // console.log(index);
    var red = imageData.data[index];
    var green = imageData.data[index + 1];
    var blue = imageData.data[index + 2];
    return new RGB(red, green, blue);
}

// returns an averaged RGB color sample around the given centerpoint.
function colorSampleRegion(imageData, centerpoint, radius) {
    var samples = [];
    for (var i = Math.max(0, centerpoint.x - radius); i < Math.min(imageData.width, centerpoint.x + radius); i++) {
        for (var j = Math.max(0, centerpoint.y - radius); j < Math.min(imageData.height, centerpoint.y + radius); j++) {
            var samplepoint = new Point(i, j);
            if (distance(centerpoint, samplepoint) < radius)
                samples.push(colorSamplePoint(imageData, samplepoint));
        }
    }
    var b, r, g;
    b = r = g = 0;
    for (i = 0; i < samples.length; i++) {
        r += samples[i].r;
        g += samples[i].g;
        b += samples[i].b;
    }
    return new RGB(r / samples.length, g / samples.length, b / samples.length);
    // !!! TODO: ADD OUTLIER CHECK AND REMOVAL (new average calculation wihout outliers)
}

// returns a regression line in RGB space about the six swatch measurements
// function swatchRegression(swatches) {

// }

// returns an array of swatch or sample rgb measurements from left to right
function getSwatchOrSampleColors(imageData, points, radius) {
    var colors = [];
    for (var i = 0; i < points.length; i++)
        colors.push(colorSampleRegion(imageData, points[i], radius));
    return colors;
}


function drawCircle(ctx, centerpoint, radius, color) {
	ctx.beginPath();
	ctx.arc(centerpoint.x, centerpoint.y, radius, 0, 2*Math.PI, false);
	ctx.fillStyle = color;
	ctx.fill();
}

// draws points on screen marking each sampling region
function TEMPshowPoints(ctx, swatches, samples, swatchradius, sampleradius) {
    console.log(swatches);
    for (var i = 0; i < NSWATCHES; i++) {
        drawCircle(ctx, swatches[i], swatchradius, 'green');
    }
    console.log(samples);
    for (i = 0; i < NSAMPLES; i++) {
        drawCircle(ctx, samples[i], sampleradius, 'blue');
    }
}

// takes image and FP locations and returns object containing list of swatch colors and sample colors
function getColors(TEMPctx, imageData, finderpatterns) {
    var transMat = getTransformMatrix(finderpatterns);
    var swatches = locateSwatchesOrSamples(transMat, finderpatterns[1], 'SWATCH');
    var samples = locateSwatchesOrSamples(transMat, finderpatterns[1], 'SAMPLE');
    var topDistance = distance(finderpatterns[1], finderpatterns[2]);
    var swatchColors = getSwatchOrSampleColors(imageData, swatches, Math.round(topDistance * SWATCHCOLORRADIUS));
    var sampleColors = getSwatchOrSampleColors(imageData, samples, Math.round(topDistance * SAMPLECOLORRADIUS));
    // console.log(swatchColors);
    // console.log(sampleColors);
    // TEMPshowPoints(TEMPctx, swatches, samples, Math.round(topDistance * SWATCHCOLORRADIUS), Math.round(topDistance * SAMPLECOLORRADIUS));
    return {swatches : swatchColors, samples : sampleColors};
}

// checks for linearity and separation in G channel of swatch colors
function swatchColorsOK(swatchcolors) {
    var increments = [];
    var avginc = 0;
    for (var i = 0; i < NSWATCHES - 1; i++) {
        var inc = swatchcolors[i + 1].g - swatchcolors[i].g;
        increments.push(inc);
        avginc += inc;
    }
    avginc = avginc / increments.length;
    for (i = 0; i < increments.length; i++)
        if (increments[i] < MINGREENINCREMENT || Math.abs(increments[i] - avginc) > MAXGREENINCVARIANCE)
            return false;
    return true;
}


// anaylzes colors and delivers test result
function compareColors(colors) {
    if (NSWATCHES != 6 || NSAMPLES != 3) {
        // console.log("ERROR: number of swatches or samples has changed, but color comparison logic has not been updated. Results are invalid.");
        return "ERROR";
    }
    if (!swatchColorsOK(colors.swatches))
        return "BADSWC";
    if (Math.abs(colors.samples[2].g - colors.samples[0].g) < MINPNGREENDIFF) // similar pos and neg samples is bad
        return "BADSMP";
    if (colors.samples[2].g < colors.swatches[4].g)  // low G pos control is bad
        return "BADPOS";
    if (colors.samples[0].g > colors.swatches[1].g)  // high G neg control is bad
        return "BADNEG";
    if (colors.samples[1].g >= colors.swatches[3].g) // high G test is positive
        return "POSITV";
    if (colors.samples[1].g > colors.swatches[2].g)  // medium G test is inconclusive
        return "INCONC";
    if (colors.samples[1].g <= colors.swatches[2].g) // low G test is negative
        return "NEGITV";
    else
        return "UNKNOWN";
}

// takes image and runs entire covid test (should be positive, negative, or various inconclusive)
function covidTest(ctx, width, height) {
	var imageData = ctx.getImageData(0, 0, width, height);  
	var finderpatterns = locateFPs(imageData, width, height);
	if (finderpatterns == -1)
		return "BADFPS";
    var colors = getColors(ctx, imageData, finderpatterns);
	return compareColors(colors);
}

// takes a test result and displays the output
function displayResult(result) {
    var topline_results = document.querySelector(".topline-results");
    var instructions = document.querySelector("#instructions");
    var explanation = document.querySelector("#explanation");

    explanation.style.display = 'block';
    if (result == "POSITV" || result == "NEGITV" || result == "INCONC" 
     || result == "BADNEG" || result == "BADPOS" || result == "BADSMP") {
        topline_results.style.display = 'block';
        if (result == "POSITV") {
            topline_results.innerHTML = "Positive";
            topline_results.style.background = "#db8686"; /* positive light red */
            instructions.innerHTML = 'You likely have COVID-19.';
            explanation.innerHTML = "Don't panic! If you are not in an at-risk group, the most important thing you can do is avoid infecting others who are more vulnerable. <a target='_blank' href='https://www.fda.gov/consumers/consumer-updates/help-stop-spread-coronavirus-and-protect-your-family'>Here is what you can do to slow the spread.</a> If you have a history of respiratory conditions or are otherwise vulnerable, contact a local health care center as soon as possible. Note: This test is not a substitute for a diagnostic test administered by a health care professional.";
        } else if (result == "NEGITV") {
            topline_results.innerHTML = "Negative";
            topline_results.style.background = "#96d9a8"; /* negative light green */
            instructions.innerHTML = 'You likely do not have COVID-19.';
            explanation.innerHTML = "Congratulations! The most important thing you can do now is avoid catching the virus and placing extra strain on our health care system. <a target='_blank' href='https://www.fda.gov/consumers/consumer-updates/help-stop-spread-coronavirus-and-protect-your-family'>Here is what you can do to protect yourself and your family.</a> Note: This test is not a substitute for a diagnostic test administered by a health care professional.";
        } else {
            topline_results.innerHTML = "Inconclusive";
            topline_results.style.background = "#e0dd87"; /* inconclusive yellow */
            instructions.innerHTML = "Please get a fresh test card and re-run the test.";
            if (result == "INCONC")
                explanation.innerHTML = "You can also try taking another picture, but it looks like something went wrong with the chemistry. In this case, your Test Sample did not clearly indicate a positive or negative result.";
            else if (result == "BADNEG")
                explanation.innerHTML = "You can also try taking another picture, but it looks like something went wrong with the chemistry. In this case, your Negative Control Sample did not work correctly, indicating likely contamination. Make sure to keep the plastic seal in place and only handle the card by the edges.";
            else if (result == "BADPOS")
                explanation.innerHTML = "You can also try taking another picture, but it looks like something went wrong with the chemistry. In this case, your Positive Control Sample did not work correctly, indicating this was probably a bad test card.";
            else if (result == "BADSMP")
                explanation.innerHTML = "You can also try taking another picture, but it looks like something went wrong with the chemistry. In this case, your Positive and  Negative Control Samples are too similar in color, indicating possible contamination or a bad test card.";
        }
    } else if (result == "BADSWC" || result == "BADFPS") {
        topline_results.style.display = 'none';
        instructions.innerHTML = "Please take another picture.";
        if (result == "BADSWC") {
            explanation.innerHTML = "We weren't able to get a clear view of the reference colors at the top of the card. Make sure the picture has good lighting and a clean background.";
        } else if (result == "BADFPS") {
            explanation.innerHTML = "We weren't able to get a clear view of the QR code patterns on the corners of the card. Make sure the picture has good lighting and a clean background, and the card is entirely in frame.";
        }
    } else {
        instructions.innerHTML = "Something went wrong analyzing your test.";
        explanation.innerHTML = "You can try taking another picture, or contact an administrator.";
    }
    document.querySelector(".instr-list-top").style.display = 'none';
    document.querySelector(".instr-list-bottom").style.display = 'block';
}

// function loadImage(input) {
//     if (input.files && input.files[0]) {
//         var selectedFile = input.files[0];
//         var reader = new FileReader();
//         reader.onload = function(event) {
//             var img = new Image();
//             img.onload = function() {
//                 canvas.width = img.width;
//                 canvas.height = img.height;
//                 ctx.drawImage(img, 0, 0);
//                 var result = covidTest(ctx, img.width, img.height);
//                 console.log(result);
//             };
//             img.src = event.target.result;
//         };
//         reader.readAsDataURL(selectedFile); 
//     } else {
//         console.log("Image could not be loaded.");
//     }
// }


// function analyze(input) {
//    loadImage(input);
// }




/* image processing steps:
1. load image as-is onto canvas
2. Create binary image to identify finder patterns.
3. Locate finder patterns in pixel coordinates
4. Create coordinate transformation matrix between "finder pattern spacing units" and pixels.
5. Transform pre-determined locations of key regions in "finder pattern spacing units" to pixels.
5. Color sample key regions using clustered averages in each zone
    - Use "finder pattern spacing units" transformed to pixels to get radius of each sampling zone.
6. Now we have in-context RGB color values for the 6 swatches and 3 samples.
7. color compare. There are many algorthims we could use to do color matching.
    I painted six swatches that qualititatively look like the PES test results. Characteristics:
        1. All have R values of 255. This is nice because we can ignore R and remove a dimension in our regression space
        2. Have linear ascending G values from 185 up to 255. I set these in increments of 14.
        3. Have nonlinear ascending B values from 160 up to 175. There's a blue "floor" at 160 that redder values can't go below.
    Min Viable Product algorithm:
        Ignore R and B. Inspect swatch G values and make sure they are reasonably linear and separated by at least +4 units each
              (otherwise prompt user to retake picture in better lighting).
        Take G value for sample 4 and make it the cutoff. A test sample G value >= swatch 4 is positive; >= swatch 3 is inconclusive; < swatch 3 is negative.
        Neg control sample must have G value <= swatch 2. Pos control sample must have G value >= swatch 5

        A future, more sophisticated algorithm may take the Blue channel into account
8. Possible results:
    1. POSITV - Likely positive
    2. NEGITV - Likely negative
    3. INCONC - Inconclusive ("orange" test sample) - fresh test required
    4. BADNEG - Bad neg control (contamination) - fresh test required
    5. BADPOS - Bad pos control (dud test) - fresh test required
    6. BADSWC - Bad swatch colors (poor lighting/camera work/printing) - retake picture straight-on in good lighting
    7. BADFPS - Bad/Missing finder patterns (poor lighting/camera work) - retake picture straight-on in good lighting
    8. BADSMP - Bad samples - too white (not implemented) or too similar pos and negative controls - fresh test required
9. Populate HTML with results and next steps

Future features:
Backend with reporting to gatech
Additional control sample: Actin Control
Outlier check and removal when sampling colors
Check for white/missing samples


HTML/CSS:
show light gray minimal icon version of test paper instead of cloud icon
    -- would be nice to remove dependency on fontsawesome icons
            */
