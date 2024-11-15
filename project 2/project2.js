var VSHADER_SOURCE = `    
    uniform mat4 u_Model;
    uniform mat4 u_World;
    // We are bundling the perspective in the camera matrix
    uniform mat4 u_Camera;
    uniform mat4 u_Projection;
    attribute vec3 a_Position;
    attribute vec3 a_Color;
    varying vec3 v_Color;
    void main() {
        gl_Position = u_Projection * u_Camera * u_World * u_Model * vec4(a_Position, 1.0);
        v_Color = a_Color;
    }
`

var FSHADER_SOURCE = `
    varying mediump vec3 v_Color;
    void main() {
        gl_FragColor = vec4(v_Color, 1.0);
    }
`

// global hooks for updating data
var g_canvas
var gl
var g_model_ref
var g_world_ref
var g_camera_ref
var g_projection_ref

// Matrices for positioning the grid
var g_model_matrix_grid
var g_world_matrix_grid

// Camera position/lookat matrix
var g_camera_matrix

// Perspective Camera properties
var g_near
var g_far
var g_fovy
var g_aspect

// Previous frame time, used for calculating framerate
var g_last_frame_ms

// calculated grid vertex count
var g_grid_vertex_count

// Constants for setup
const INITIAL_CAMERA_X = 0
const INITIAL_CAMERA_Y = 0
const INITIAL_NEAR = 1
const INITIAL_FAR = 20
const INITIAL_FOVY = 90
const INITIAL_ASPECT = 1

var chicken_mesh;
var chicken_mesh_vertices;

var maxwell_mesh;
var maxwell_mesh_vertices;

var flag_mesh;
var flag_mesh_vertices;

var yum_mesh;
var yum_mesh_vertices
var g_model_matrix_yum;

// orthographic camera
const g_left = -2
const g_right = 2
const g_top = 2
const g_bottom = -2
var cameraOrtho = false;
var perspect_or_ortho_matrix

function main() {

    // Listen for slider changes
    slider_input = document.getElementById('sliderX')
    slider_input.addEventListener('input', (event) => {
        updateCameraX(event.target.value)
    })

    slider_input = document.getElementById('sliderY')
    slider_input.addEventListener('input', (event) => {
        updateCameraY(event.target.value)
    })

    /*slider_input = document.getElementById('sliderRotateY')
    slider_input.addEventListener('input', (event) => {
        updateCameraRotateY(event.target.value)
    })*/

    slider_input = document.getElementById('sliderNear')
    slider_input.addEventListener('input', (event) => {
        updateNear(event.target.value)
    })

    slider_input = document.getElementById('sliderFar')
    slider_input.addEventListener('input', (event) => {
        updateFar(event.target.value)
    })

    slider_input = document.getElementById('sliderFOVY')
    slider_input.addEventListener('input', (event) => {
        updateFOVY(event.target.value)
    })

    slider_input = document.getElementById('sliderAspect')
    slider_input.addEventListener('input', (event) => {
        updateAspect(event.target.value)
    })

    g_canvas = document.getElementById('webgl');

    // Get the rendering context for WebGL
    gl = getWebGLContext(g_canvas, true)
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL')
        return
    }

    // Initialize GPU's vertex and fragment shaders programs
    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
        console.log('Failed to intialize shaders.')
        return
    }

    // get the VBO handle
    var VBOloc = gl.createBuffer();
    if (!VBOloc) {
        console.log('Failed to create the vertex buffer object')
        return -1
    }

    // parse our meshes
    chicken_mesh = parseOBJ(chicken_mesh_unparsed)
    chicken_mesh_vertices = chicken_mesh.length / 3
    
    maxwell_mesh = parseOBJ(maxwell_mesh_unparsed)
    maxwell_mesh_vertices = maxwell_mesh.length / 3

    flag_mesh = parseOBJ(flag_mesh_unparsed)
    flag_mesh_vertices = flag_mesh.length / 3

    yum_mesh = parseOBJ(yum_mesh_unparsed)
    yum_mesh_vertices = yum_mesh.length / 3

    // get the grid mesh and colors
    // use a spacing of 1 for now, for a total of 200 lines
    // use a simple green color
    grid_data = build_grid_attributes(1, 1, [0.0, 1.0, 0.0])
    grid_mesh = grid_data[0]
    grid_color = grid_data[1]

    // meshes, add new meshes to the front
    var attributes = yum_mesh.concat(flag_mesh).concat(maxwell_mesh).concat(chicken_mesh).concat(grid_mesh)

    // colors
    attributes = attributes.concat(build_color_attributes(true, yum_mesh_vertices))
    attributes = attributes.concat(build_color_attributes(false, flag_mesh_vertices))
    attributes = attributes.concat(build_color_attributes(true, maxwell_mesh_vertices))
    attributes = attributes.concat(build_color_attributes(false, chicken_mesh_vertices))
    attributes = attributes.concat(grid_color)

    gl.bindBuffer(gl.ARRAY_BUFFER, VBOloc)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(attributes), gl.STATIC_DRAW)

    // put the attributes on the VBO
    if (setup_vec3('a_Position', 0, 0) < 0) {
        return -1
    }

    // add new meshes at front
    const FLOAT_SIZE = 4
    var vertex_count = (yum_mesh_vertices * 3 +
                        flag_mesh_vertices * 3 +
                        maxwell_mesh_vertices * 3 +
                        chicken_mesh_vertices * 3 +
                        g_grid_vertex_count * 3)

    if (setup_vec3('a_Color', 0, vertex_count * FLOAT_SIZE) < 0) {
        return -1
    }

    // get our uniform references
    g_model_ref = gl.getUniformLocation(gl.program, 'u_Model')
    g_world_ref = gl.getUniformLocation(gl.program, 'u_World')
    g_camera_ref = gl.getUniformLocation(gl.program, 'u_Camera')
    g_projection_ref = gl.getUniformLocation(gl.program, 'u_Projection')

    // chicken
    g_model_matrix_chicken = new Matrix4().scale(1.2, 1.2, 1.2)
    g_world_matrix_chicken = new Matrix4().translate(1, -1.0, -2)

    // maxwell
    g_model_matrix_maxwell = new Matrix4().scale(0.0005, 0.0005, 0.0005) // he is massive...
    g_model_matrix_maxwell.rotate(-130, 0, 1, 0)
    g_world_matrix_maxwell = new Matrix4().translate(-0.5, -0.5, -2)

    // flag
    g_model_matrix_flag = new Matrix4().scale(1.5,1.5,1.5)
    g_world_matrix_flag = new Matrix4()

    // yum
    g_model_matrix_yum = new Matrix4().rotate(-20, 0, 0, 1).scale(0.08, 0.08, 0.08)
    g_world_matrix_yum = new Matrix4().translate(1.2,2,-5)
    
    // Put the grid "below" the camera (and cubes)
    g_model_matrix_grid = new Matrix4()
    g_world_matrix_grid = new Matrix4().translate(0, -1, 0)

    // Initially the camera is just the identity
    g_camera_matrix = new Matrix4()

    // Initial values
    updateCameraX(INITIAL_CAMERA_X)
    updateCameraY(INITIAL_CAMERA_Y)
    updateNear(INITIAL_NEAR)
    updateFar(INITIAL_FAR)
    updateFOVY(INITIAL_FOVY)
    updateAspect(INITIAL_ASPECT)

    // Initial time
    g_last_frame_ms = Date.now()

    // Enable face culling and the depth test
    gl.enable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)

    draw()
}

const ROTATION_SPEED = .09

// update the cube rotations
function tick() {
    var delta_time

    // calculate time since the last frame
    var current_time = Date.now()
    delta_time = current_time - g_last_frame_ms
    g_last_frame_ms = current_time

    // rotations
    g_model_matrix_chicken.rotate(delta_time * ROTATION_SPEED, 0, 1, 0)
    g_world_matrix_maxwell.rotate(delta_time * ROTATION_SPEED, 0, 1, 0)

    // flag
    g_world_matrix_flag = new Matrix4()
    g_world_matrix_flag.translate(0.1, 2.5,0)

    // reference frame!
    g_world_matrix_flag.concat(g_world_matrix_maxwell).concat(g_world_matrix_grid)
    draw()
}

// draw to the screen on the next frame
function draw() {
    // Update our perspective and camera matrices
    // Use the same perspective and camera for everything
    gl.uniformMatrix4fv(g_camera_ref, false, g_camera_matrix.elements)

    if (cameraOrtho) {
        perspect_or_ortho_matrix = setOrtho()
    }
    else {
        perspect_or_ortho_matrix = setPerspect()
    }
    gl.uniformMatrix4fv(g_projection_ref, false, perspect_or_ortho_matrix.elements)

    // Clear the canvas with a black background
    gl.clearColor(0.0, 0.0, 0.0, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // yum text
    gl.uniformMatrix4fv(g_model_ref, false, g_model_matrix_yum.elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix_yum.elements)
    gl.drawArrays(gl.TRIANGLES, 0, yum_mesh_vertices)

    // flag
    gl.uniformMatrix4fv(g_model_ref, false, g_model_matrix_flag.elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix_flag.elements)
    gl.drawArrays(gl.TRIANGLES, yum_mesh_vertices, flag_mesh_vertices)

    // maxwell
    gl.uniformMatrix4fv(g_model_ref, false, g_model_matrix_maxwell.elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix_maxwell.elements)
    gl.drawArrays(gl.TRIANGLES, flag_mesh_vertices + yum_mesh_vertices, maxwell_mesh_vertices)

    // chicken
    gl.uniformMatrix4fv(g_model_ref, false, g_model_matrix_chicken.elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix_chicken.elements)
    gl.drawArrays(gl.TRIANGLES, maxwell_mesh_vertices + flag_mesh_vertices + yum_mesh_vertices, chicken_mesh_vertices)

    // Finally, draw the grid with gl.lines
    // Note we can use the regular vertex offset with gl.LINES
    gl.uniformMatrix4fv(g_model_ref, false, g_model_matrix_grid.elements)
    gl.uniformMatrix4fv(g_world_ref, false, g_world_matrix_grid.elements)
    gl.drawArrays(gl.LINES, chicken_mesh_vertices + maxwell_mesh_vertices + flag_mesh_vertices + yum_mesh_vertices, g_grid_vertex_count)

    requestAnimationFrame(tick, g_canvas)
}

function updateSpin(amount) {
    g_model_matrix_yum.rotate(45, 1, 0, 1)
}

function updateCameraX(amount) {
    label = document.getElementById('cameraX')
    label.textContent = `Camera X: ${Number(amount).toFixed(2)}`
    g_camera_matrix = new Matrix4().setTranslate(-Number(amount), 0.0, 0.0)
}

function updateCameraY(amount) {
    label = document.getElementById('cameraY')
    label.textContent = `Camera Y: ${Number(amount).toFixed(2)}`
    g_camera_matrix = new Matrix4().setTranslate(0.0, -Number(amount), 0.0)
}

/*function updateCameraRotateY(amount) {
    label = document.getElementById('cameraRotateY')
    label.textContent = `Camera Y: ${Number(amount).toFixed(2)}`
    let radius = 3
    g_camera_matrix= new Matrix4().setTranslate(Math.cos(Number(amount)), 0, Math.sin(Number(amount)))
    //g_camera_matrix.rotate(Number(amount)*3, 0, 1, 0)
}*/

function updateNear(amount) {
    label = document.getElementById('near')
    label.textContent = `Near: ${Number(amount).toFixed(2)}`
    g_near = Number(amount)
}

function updateFar(amount) {
    label = document.getElementById('far')
    label.textContent = `Far: ${Number(amount).toFixed(2)}`
    g_far = Number(amount)
}

function updateFOVY(amount) {
    label = document.getElementById('fovy')
    label.textContent = `FOVY: ${Number(amount).toFixed(2)}`
    g_fovy = Number(amount)
}

function updateAspect(amount) {
    label = document.getElementById('aspect')
    label.textContent = `Aspect: ${Number(amount).toFixed(2)}`
    g_aspect = Number(amount)
}

function setOrtho() {
    cameraOrtho = true;
    return new Matrix4().setOrtho(g_left, g_right, g_bottom, g_top, g_near, g_far)
}

function setPerspect() {
    cameraOrtho = false;
    return new Matrix4().setPerspective(g_fovy, g_aspect, g_near, g_far)
}

// Helper to setup vec3 attributes
function setup_vec3(name, stride, offset) {
    // Get the attribute
    var attributeID = gl.getAttribLocation(gl.program, `${name}`)
    if (attributeID < 0) {
        console.log(`Failed to get the storage location of ${name}`)
        return -1;
    }

    // Set how the GPU fills the a_Position variable with data from the GPU 
    gl.vertexAttribPointer(attributeID, 3, gl.FLOAT, false, stride, offset)
    gl.enableVertexAttribArray(attributeID)

    return 0
}

// Helper to construct colors
// makes every triangle a slightly different shade of blue
function build_color_attributes(red, vertex_count) {
    var colors = []
    for (var i = 0; i < vertex_count / 3; i++) {
        // three vertices per triangle
        for (var vert = 0; vert < 3; vert++) {
            // go from 0 -> n "smoothly"
            var shade = (i * 3) / vertex_count
            // use red or blue as our constant 1.0
            if (red) {
                colors.push(1.0, shade, shade)
            }
            else {
                colors.push(shade, shade, 1.0)
            }
        }
    }
    return colors
}

// How far in the X and Z directions the grid should extend
// Recall tflag the camera "rests" on the X/Z plane, since Z is "out" from the camera
const GRID_X_RANGE = 100
const GRID_Z_RANGE = 100

// Helper to build a grid mesh and colors
// Returns these results as a pair of arrays
// Each vertex in the mesh is constructed with an associated grid_color
function build_grid_attributes(grid_row_spacing, grid_column_spacing, grid_color) {
    if (grid_row_spacing < 1 || grid_column_spacing < 1) {
        console.error("Cannot have grid spacing less than 1")
        return [[], []]
    }
    var mesh = []
    var colors = []

    // Construct the rows
    for (var x = -GRID_X_RANGE; x < GRID_X_RANGE; x += grid_row_spacing) {
        // two vertices for each line
        // one at -Z and one at +Z
        mesh.push(x, 0, -GRID_Z_RANGE)
        mesh.push(x, 0, GRID_Z_RANGE)
    }

    // Construct the columns extending "outward" from the camera
    for (var z = -GRID_Z_RANGE; z < GRID_Z_RANGE; z += grid_row_spacing) {
        // two vertices for each line
        // one at -Z and one at +Z
        mesh.push(-GRID_X_RANGE, 0, z)
        mesh.push(GRID_X_RANGE, 0, z)
    }

    // directly store the number of vertices
    g_grid_vertex_count = mesh.length / 3

    // We need one color per vertex
    // since we have 3 components for each vertex, this is length/3
    for (var i = 0; i < mesh.length / 3; i++) {
        colors.push(grid_color[0], grid_color[1], grid_color[2])
    }

    return [mesh, colors]
}

// same function i used as project 1, but modified so it accounts for faces
function parseOBJ(data) {
    const vertices = [];
    const faces = [];
  
    const lines = data.split('\n');
    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('v ')) {
            const parts = line.split(/\s+/);
            vertices.push(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            );
        } else if (line.startsWith('f ')) {
            const parts = line.split(/\s+/);
            faces.push(
              parseFloat(parts[1]),
              parseFloat(parts[2]),
              parseFloat(parts[3]),
            )
        } 
      }
  
    // faces
    var finalVertices = [];
    for (const face of faces) {
        finalVertices.push(vertices[(face*3)-3])
        finalVertices.push(vertices[(face*3)-3+1])
        finalVertices.push(vertices[(face*3)-3+2])
    }
    return finalVertices
  }

// meshes
const yum_mesh_unparsed = `# Object Export From Tinkercad Server 2015

mtllib obj.mtl

o obj_0
v 24.136 		6.082 		0
v 24.16 		6.64 		0
v 24.198 		7.284 		0
v 24.116 		5.502 		0
v 24.231 		7.938 		0
v -8.1 		-5.5 		0
v 24.064 		3.78 		0
v 24.078 		4.32 		0
v -7.18 		-6.222 		0
v 24.1 		4.9 		0
v -5.993 		-6.656 		0
v 24.06 		3.28 		0
v 24.26 		8.6 		0
v 10.18 		8.62 		10
v 24.14 		8.6 		0
v 26.6 		11.1 		0
v -4.54 		-6.8 		0
v 22.84 		11.1 		0
v -3.767 		-6.76 		0
v 26.6 		-8.74 		0
v 24.06 		-8.74 		0
v 17.14 		-5.08 		0
v -0.416 		-4.404 		0
v 17.22 		-5.08 		0
v -3.073 		-6.64 		0
v -0.602 		-8.06 		0
v 18.08 		-8.74 		0
v -2.46 		-6.44 		0
v 11.74 		11.1 		0
v 10.08 		8.62 		10
v -7.74 		-8.5 		0
v 10.18 		8.62 		0
v -6.802 		-8.789 		0
v -5.776 		-8.962 		0
v 10.34 		3.12 		10
v 10.336 		3.647 		10
v 10.322 		4.213 		10
v 10.3 		4.82 		10
v 10.273 		5.447 		10
v -4.66 		-9.02 		0
v 10.247 		6.047 		10
v 10.22 		6.62 		10
v 10.178 		7.287 		10
v 10.131 		7.953 		10
v -3.487 		-8.96 		0
v 7.82 		11.1 		10
v 10.34 		3.12 		0
v 0.08 		11.12 		10
v -1.909 		-6.164 		0
v -2.42 		-8.78 		0
v 10.08 		8.62 		0
v 2.62 		11.12 		10
v -1.429 		-5.818 		0
v -1.46 		-8.48 		0
v 16 		-8.74 		10
v -1.02 		-5.4 		0
v 10.34 		-8.74 		10
v 10.131 		7.953 		0
v -0.689 		-4.931 		0
v 10.178 		7.287 		0
v 10.22 		6.62 		0
v 10.247 		6.047 		0
v 0.049 		-2.513 		10
v 10.273 		5.447 		0
v 10.3 		4.82 		0
v -9.26 		-1.82 		10
v 10.322 		4.213 		0
v -9.26 		-1.82 		0
v 10.336 		3.647 		0
v 0.08 		-1.8 		10
v -9.131 		-3.287 		10
v -9.131 		-3.287 		0
v 7.82 		11.1 		0
v 7.82 		-8.74 		10
v -8.744 		-4.513 		10
v -8.744 		-4.513 		0
v 2.62 		11.12 		0
v 0.08 		11.12 		0
v 16 		-8.74 		0
v 10.34 		-8.74 		0
v -11.78 		-1.7 		0
v -11.78 		-1.7 		10
v 0.049 		-2.513 		0
v 0.158 		-7.547 		10
v 0.82 		-6.94 		10
v 1.369 		-6.249 		10
v -11.729 		-2.771 		0
v 1.816 		-5.482 		10
v -11.729 		-2.771 		10
v 2.16 		-4.64 		10
v 2.416 		-3.724 		10
v 2.569 		-2.764 		10
v 2.62 		-1.76 		10
v 0.08 		-1.8 		0
v -11.576 		-3.771 		0
v -11.576 		-3.771 		10
v -9.26 		11.08 		10
v -11.78 		11.08 		10
v 7.82 		-8.74 		0
v -11.32 		-4.7 		0
v -11.32 		-4.7 		10
v -14.3 		11.1 		10
v -10.964 		-5.562 		0
v -10.964 		-5.562 		10
v -0.2 		-3.82 		10
v -10.511 		-6.336 		0
v -10.511 		-6.336 		10
v -0.044 		-3.187 		10
v -5.776 		-8.962 		10
v -6.802 		-8.789 		10
v -4.66 		-9.02 		10
v -8.1 		-5.5 		10
v -9.96 		-7.02 		0
v -9.96 		-7.02 		10
v -7.18 		-6.222 		10
v -9.313 		-7.611 		0
v -9.313 		-7.611 		10
v -5.993 		-6.656 		10
v -8.573 		-8.104 		0
v -8.573 		-8.104 		10
v -4.54 		-6.8 		10
v -3.767 		-6.76 		10
v -17.02 		11.1 		0
v -17.02 		11.1 		10
v -26.18 		11.1 		10
v -26.18 		11.1 		0
v -28.92 		11.1 		0
v -28.92 		11.1 		10
v -3.073 		-6.64 		10
v -22.88 		-1.16 		0
v -22.88 		-8.74 		0
v -22.88 		-8.74 		10
v -22.88 		-1.16 		10
v -20.36 		-8.74 		0
v -20.36 		-8.74 		10
v -2.46 		-6.44 		10
v 2.62 		-1.76 		0
v 2.569 		-2.764 		0
v 2.416 		-3.724 		0
v 2.16 		-4.64 		0
v 1.816 		-5.482 		0
v 1.369 		-6.249 		0
v 0.82 		-6.94 		0
v 0.158 		-7.547 		0
v -1.909 		-6.164 		10
v -11.78 		11.08 		0
v -9.26 		11.08 		0
v -20.36 		-1.02 		10
v -1.429 		-5.818 		10
v -20.36 		-1.02 		0
v -1.02 		-5.4 		10
v -21.64 		1.06 		10
v -0.689 		-4.931 		10
v -21.64 		1.06 		0
v -3.487 		-8.96 		10
v -2.42 		-8.78 		10
v -0.416 		-4.404 		10
v -1.46 		-8.48 		10
v -0.602 		-8.06 		10
v -14.3 		11.1 		0
v -0.2 		-3.82 		0
v -0.044 		-3.187 		0
v -7.74 		-8.5 		10
v 24.16 		6.64 		10
v 24.198 		7.284 		10
v 24.136 		6.082 		10
v 24.231 		7.938 		10
v 24.116 		5.502 		10
v 26.6 		11.1 		10
v 24.26 		8.6 		10
v 26.6 		-8.74 		10
v 24.078 		4.32 		10
v 24.1 		4.9 		10
v 24.064 		3.78 		10
v 24.06 		3.28 		10
v 24.14 		8.6 		10
v 22.84 		11.1 		10
v 24.06 		-8.74 		10
v 18.08 		-8.74 		10
v 17.14 		-5.08 		10
v 17.22 		-5.08 		10
v 11.74 		11.1 		10
# 182 vertices

g group_0_15277357

usemtl color_15277357
s 0

f 3 	16 	2
f 1 	2 	16
f 4 	1 	16
f 5 	16 	3
f 10 	16 	8
f 119 	116 	9
f 16 	12 	7
f 7 	8 	16
f 10 	4 	16
f 13 	16 	5
f 11 	33 	9
f 15 	18 	13
f 17 	34 	11
f 16 	13 	18
f 16 	20 	12
f 21 	12 	20
f 24 	27 	22
f 19 	45 	17
f 18 	15 	24
f 27 	24 	15
f 14 	182 	30
f 51 	29 	32
f 37 	46 	36
f 38 	46 	37
f 39 	46 	38
f 41 	46 	39
f 43 	46 	42
f 41 	42 	46
f 44 	46 	43
f 30 	46 	44
f 35 	36 	46
f 73 	29 	51
f 26 	54 	49
f 54 	50 	28
f 182 	14 	180
f 56 	144 	53
f 28 	49 	54
f 35 	74 	57
f 66 	68 	147
f 23 	141 	59
f 73 	51 	58
f 73 	58 	60
f 73 	60 	61
f 73 	61 	62
f 73 	62 	64
f 73 	64 	65
f 67 	73 	65
f 69 	73 	67
f 99 	73 	47
f 68 	66 	71
f 68 	71 	72
f 88 	90 	157
f 72 	71 	75
f 72 	75 	76
f 137 	78 	77
f 59 	142 	56
f 46 	74 	35
f 29 	22 	32
f 32 	22 	79
f 27 	79 	22
f 75 	6 	76
f 81 	87 	89
f 81 	89 	82
f 105 	157 	90
f 90 	91 	105
f 108 	105 	91
f 91 	92 	108
f 63 	108 	92
f 48 	70 	93
f 52 	48 	93
f 93 	70 	92
f 63 	92 	70
f 26 	53 	144
f 137 	138 	94
f 87 	95 	96
f 87 	96 	89
f 95 	100 	101
f 95 	101 	96
f 82 	97 	98
f 25 	28 	50
f 45 	25 	50
f 40 	17 	45
f 34 	17 	40
f 119 	9 	31
f 33 	11 	34
f 25 	45 	19
f 53 	26 	49
f 100 	103 	104
f 100 	104 	101
f 82 	89 	66
f 34 	109 	110
f 34 	110 	33
f 86 	88 	153
f 157 	153 	88
f 109 	34 	111
f 40 	111 	34
f 103 	106 	107
f 103 	107 	104
f 106 	113 	114
f 106 	114 	107
f 47 	35 	80
f 32 	79 	55
f 116 	117 	114
f 116 	114 	113
f 114 	117 	112
f 69 	36 	35
f 69 	35 	47
f 119 	120 	117
f 119 	117 	116
f 115 	112 	117
f 69 	47 	73
f 31 	120 	119
f 123 	124 	102
f 80 	99 	47
f 67 	37 	36
f 67 	36 	69
f 125 	126 	127
f 125 	127 	128
f 32 	55 	14
f 130 	131 	132
f 130 	132 	133
f 134 	135 	132
f 134 	132 	131
f 111 	155 	121
f 142 	59 	141
f 141 	23 	140
f 140 	161 	139
f 139 	162 	138
f 143 	56 	142
f 144 	56 	143
f 83 	94 	138
f 137 	94 	78
f 65 	38 	37
f 65 	37 	67
f 128 	127 	130
f 128 	130 	133
f 123 	154 	152
f 123 	152 	124
f 163 	110 	115
f 120 	163 	115
f 117 	120 	115
f 75 	107 	112
f 89 	96 	71
f 71 	66 	89
f 96 	101 	71
f 75 	71 	101
f 101 	104 	75
f 104 	107 	75
f 114 	112 	107
f 72 	87 	68
f 156 	158 	136
f 135 	134 	148
f 150 	148 	134
f 125 	152 	154
f 125 	154 	126
f 45 	155 	111
f 45 	111 	40
f 155 	45 	156
f 50 	156 	45
f 159 	84 	149
f 152 	102 	124
f 148 	102 	152
f 156 	50 	158
f 54 	158 	50
f 125 	128 	152
f 128 	133 	152
f 132 	135 	133
f 143 	85 	84
f 143 	84 	144
f 152 	133 	148
f 148 	133 	135
f 153 	151 	86
f 84 	85 	151
f 151 	149 	84
f 85 	86 	151
f 68 	81 	147
f 146 	147 	81
f 74 	46 	99
f 73 	99 	46
f 150 	154 	160
f 142 	86 	85
f 142 	85 	143
f 161 	140 	23
f 162 	139 	161
f 141 	88 	86
f 141 	86 	142
f 83 	138 	162
f 140 	90 	88
f 140 	88 	141
f 139 	91 	90
f 139 	90 	140
f 149 	145 	159
f 158 	159 	145
f 145 	136 	158
f 136 	129 	156
f 122 	155 	129
f 118 	115 	110
f 110 	109 	118
f 121 	118 	109
f 109 	111 	121
f 122 	121 	155
f 156 	129 	155
f 138 	92 	91
f 138 	91 	139
f 97 	82 	66
f 137 	93 	92
f 137 	92 	138
f 76 	6 	106
f 106 	103 	76
f 103 	100 	76
f 72 	76 	100
f 95 	72 	100
f 87 	72 	95
f 81 	68 	87
f 113 	106 	6
f 116 	113 	6
f 6 	9 	116
f 33 	31 	9
f 3 	2 	164
f 3 	164 	165
f 147 	97 	66
f 2 	1 	166
f 2 	166 	164
f 147 	146 	98
f 147 	98 	97
f 51 	32 	14
f 123 	160 	154
f 82 	98 	81
f 146 	81 	98
f 154 	150 	130
f 130 	127 	154
f 126 	154 	127
f 64 	39 	38
f 64 	38 	65
f 5 	3 	165
f 5 	165 	167
f 102 	150 	160
f 150 	134 	130
f 131 	130 	134
f 168 	166 	4
f 1 	4 	166
f 102 	148 	150
f 62 	41 	39
f 62 	39 	64
f 160 	123 	102
f 14 	30 	51
f 4 	10 	168
f 13 	5 	167
f 13 	167 	170
f 171 	20 	169
f 16 	169 	20
f 61 	42 	41
f 61 	41 	62
f 52 	77 	78
f 52 	78 	48
f 10 	8 	172
f 10 	172 	173
f 166 	169 	164
f 8 	7 	174
f 8 	174 	172
f 60 	43 	42
f 60 	42 	61
f 7 	175 	174
f 168 	169 	166
f 165 	164 	169
f 10 	173 	168
f 175 	169 	174
f 174 	169 	172
f 7 	12 	175
f 54 	26 	158
f 169 	170 	167
f 167 	165 	169
f 169 	168 	173
f 173 	172 	169
f 9 	6 	115
f 58 	44 	43
f 58 	43 	60
f 15 	13 	170
f 15 	170 	176
f 115 	118 	9
f 161 	105 	108
f 16 	177 	169
f 51 	30 	44
f 51 	44 	58
f 16 	18 	177
f 19 	17 	122
f 75 	112 	6
f 178 	175 	21
f 12 	21 	175
f 21 	20 	171
f 21 	171 	178
f 52 	137 	77
f 129 	19 	122
f 176 	179 	27
f 176 	27 	15
f 112 	115 	6
f 52 	93 	137
f 22 	29 	180
f 182 	180 	29
f 24 	22 	180
f 24 	180 	181
f 55 	79 	27
f 118 	11 	9
f 181 	177 	24
f 18 	24 	177
f 74 	99 	57
f 80 	57 	99
f 179 	55 	27
f 17 	118 	121
f 53 	145 	149
f 35 	57 	80
f 121 	122 	17
f 149 	151 	53
f 162 	108 	83
f 83 	108 	63
f 94 	83 	63
f 94 	63 	70
f 26 	144 	84
f 29 	73 	182
f 46 	182 	73
f 78 	94 	70
f 78 	70 	48
f 161 	157 	105
f 176 	170 	177
f 177 	170 	169
f 49 	136 	145
f 178 	171 	175
f 169 	175 	171
f 55 	179 	180
f 53 	49 	145
f 179 	176 	181
f 177 	181 	176
f 181 	180 	179
f 31 	163 	120
f 46 	30 	182
f 55 	180 	14
f 163 	31 	110
f 33 	110 	31
f 23 	153 	157
f 23 	157 	161
f 158 	26 	159
f 84 	159 	26
f 162 	161 	108
f 118 	17 	11
f 25 	19 	129
f 28 	25 	129
f 28 	129 	136
f 49 	28 	136
f 56 	53 	151
f 151 	153 	56
f 59 	56 	153
f 23 	59 	153
# 352 faces

 #end of obj_0

`
const flag_mesh_unparsed = `mtllib materials.mtl
v 0.06293148 0.2454112 -0.08599479
v 0.06938797 0.2457929 -0.09016988
v 0.0890922 -0.5379938 -0.1313999
v 0.0826357 -0.5383756 -0.1272248
v 0.0728851 0.2462413 -0.09701981
v 0.09258926 -0.5375454 -0.1382498
v 0.07248574 0.2466357 -0.1047091
v 0.09218997 -0.5371511 -0.1459392
v 0.06829703 0.2468705 -0.1111775
v 0.08800119 -0.5369161 -0.1524076
v 0.06144118 0.2468832 -0.1146918
v 0.08114541 -0.5369036 -0.1559218
v 0.05375534 0.2466698 -0.1143102
v 0.07345957 -0.5371169 -0.1555403
v 0.04729885 0.2462878 -0.1101351
v 0.06700307 -0.5374988 -0.1513652
v 0.04380178 0.2458396 -0.1032852
v 0.06350595 -0.5379471 -0.1445152
v 0.04420108 0.2454453 -0.09559588
v 0.0639053 -0.5383415 -0.1368259
v 0.04838985 0.2452102 -0.0891275
v 0.06809402 -0.5385765 -0.1303575
v 0.05524564 0.2451978 -0.08561325
v 0.07494986 -0.538589 -0.1268433
v 0.05460554 0.1639605 -0.09767562
v 0.05502951 0.2404397 -0.09354078
v 0.04383194 0.2452192 -0.08606132
v -0.007044494 0.1472805 0.05082922
v -0.1048635 0.0594101 0.1704545
v -0.1152793 0.1175818 0.2368224
v -0.1914206 0.07542539 0.3440783
v 0.05276477 0.0464865 -0.1025432
vn 0.3080096 -0.04225356 0.9504445
vn 0.7422702 -0.01657847 0.6698956
vn 0.9776402 0.01353881 0.2098487
vn 0.9510521 0.04002838 -0.306427
vn 0.6696305 0.05579237 -0.7405959
vn 0.208782 0.05660685 -0.9763226
vn -0.3080097 0.04225356 -0.9504445
vn -0.7422704 0.01657846 -0.6698954
vn -0.9776402 -0.01353882 -0.2098486
vn -0.9510522 -0.04002838 0.306427
vn -0.6696306 -0.05579237 0.7405957
vn -0.2087817 -0.05660684 0.9763227
vn -0.02509712 0.9983047 0.05251446
vn 0.02509712 -0.9983047 -0.05251446
vn -0.5404192 0.04841048 -0.8400021
vn 0.834804 -0.3423947 0.4311244
vn 0.9242914 -0.0257129 0.3808206
vn -0.8881856 0.0882549 -0.4509297
vn 0.8069034 -0.5220572 0.2763391
vn -0.1032434 0.9484914 0.2995078
vn -0.5643789 0.043003 -0.8243951
vn -0.8659524 0.002553879 -0.50012
vn 0.8647936 -0.03430834 0.5009541
vn 0.6117069 0.5622494 0.5564984
vn 0.8220178 -0.3580365 0.442828
vn 0.8172531 0.2557494 0.5164202
usemtl mat22
f 4//1 3//1 2//1 1//1
f 3//2 6//2 5//2 2//2
f 6//3 8//3 7//3 5//3
f 8//4 10//4 9//4 7//4
f 10//5 12//5 11//5 9//5
f 12//6 14//6 13//6 11//6
f 14//7 16//7 15//7 13//7
f 16//8 18//8 17//8 15//8
f 18//9 20//9 19//9 17//9
f 22//11 24//11 23//11 21//11
f 24//12 4//12 1//12 23//12
usemtl mat21
f 20//10 22//10 21//10 19//10
f 1//13 2//13 5//13 7//13 9//13 11//13 13//13 15//13 17//13 19//13 21//13 23//13
f 24//14 22//14 20//14 18//14 16//14 14//14 12//14 10//14 8//14 6//14 3//14 4//14
usemtl mat10
f 27//15 26//15 25//15
f 30//16 29//16 28//16
f 26//17 28//17 25//17
f 29//18 31//18 27//18
f 28//19 29//19 25//19
f 31//20 30//20 26//20
f 25//21 32//21 27//21
f 27//22 32//22 29//22
f 29//23 32//23 25//23
f 26//24 27//24 31//24
f 30//25 31//25 29//25
f 26//26 30//26 28//26

` 
const maxwell_mesh_unparsed = `# File generated by ImageToStl.com - Free Image and 3D model conversion tools

mtllib [etkjdoiqwhuiorhvuier.mtl

# dingus_0
o obj1
v -542.72675514 467.17874638 709.24007434
v -1011.51571274 319.71605749 642.10876978
v -499.94311333 37.7281123 544.88529544
v -954.43210602 1594.29029168 -369.41506611
v -1074.99027252 1451.74274764 -565.73529054
v -1294.46811676 1392.2964361 -422.72814546
v -1019.67735291 96.07677716 -569.65629236
v -444.00053024 -11.85652699 -554.04481695
v -1021.02718353 3.79484875 -74.22247591
v 1182.17010498 1253.27176619 559.04344167
v 1252.05144882 1278.25217736 322.66982234
v 1234.68074799 1345.82781318 263.57640751
v -522.8474617 1439.81999255 -652.63771627
v -241.29433632 1268.09776215 -708.00811447
v -693.11761856 1299.98652583 -753.30755432
v -1173.21529388 48.79252796 431.97116057
v -1241.45994186 248.74304588 515.5551982
v -1351.91268921 184.65116164 374.44099756
v -1215.19861221 1327.20437684 331.60407378
v -1051.37577057 1312.74306775 439.04306959
v -1078.87811661 1467.49862328 213.10708456
v -1146.11845016 200.61129452 -651.15016391
v -1265.89479446 183.01987457 -523.9418328
v -752.04205513 1551.55325484 -551.73951631
v -492.19613075 1510.33048903 -568.59908868
v 198.97295237 1533.8250662 307.99564168
v 145.17405033 1490.01879991 311.00315614
v 180.22731543 1461.89925023 399.27678133
v 298.19498062 1139.76754045 518.01972894
v 375.96225739 1346.89702035 526.86783781
v 296.45829201 1403.80046867 469.68346613
v 1041.14990234 599.23592437 -242.17734563
v 988.50250244 565.04956145 52.36389372
v 986.88488007 259.76718125 -252.62956083
v 748.45476151 1548.67950431 -234.6704622
v 866.47205353 1641.48117057 -234.67457812
v 818.45273972 1484.59592071 -280.09405481
v 447.94640541 1106.38210853 -434.13490201
v 393.22896004 1310.15600468 -335.03072149
v 635.98604202 1279.13298436 -303.19125034
v 98.54032993 177.79582893 -722.22188032
v 57.31090903 22.01581581 -696.1329496
v -353.27138901 222.6754394 -751.90042309
v -257.2281599 -9.91782666 -556.12830954
v 57.31090903 22.01581581 -696.1329496
v 83.74310732 -37.46983346 -544.90460739
v 163.05967569 1255.25178393 -617.07784123
v 124.03968573 1430.50683252 -395.63068808
v -521.50993347 1580.02559825 -458.24820511
v 71.26579285 168.55654816 591.4426529
v -225.1206398 23.48422144 532.56845092
v 99.3710041 -42.16387956 543.39495392
v 3.92205231 1120.80010286 518.94374707
v -358.94694328 1264.25330237 414.34696581
v 43.1528151 1034.08708443 577.39503226
v 3.69950384 1404.94390916 377.526412
v 20.60660273 1288.60252276 461.86445223
v 220.39606571 1360.96581439 525.61089277
v -1469.52295303 763.73712184 387.89693787
v -1272.42193222 594.64320459 543.74837724
v -1227.39887238 918.99747557 567.48213101
v -1454.78305817 450.15989699 375.47821817
v 1041.14990234 599.23592437 -242.17734563
v 978.28407288 713.64843258 -475.06682579
v 1041.47138596 808.48203656 -234.31915104
v -104.3469429 860.45772933 725.80232907
v -81.11572266 715.40735376 769.03703478
v 150.09566545 911.64904707 650.80799509
v -460.05311012 773.96443437 765.23553637
v 783.61945152 1204.6529056 732.53254338
v 803.49063873 1064.30160579 705.92796152
v 960.76984406 996.5922435 634.08778167
v -1265.08674622 1387.0228031 133.38854365
v -359.09333229 1458.43375201 175.32119832
v -841.39261246 1490.16011808 210.55950683
v -357.08904266 1367.55986253 295.10151517
v 538.82408142 -41.00545857 499.17584134
v 96.38358951 -76.70453079 409.32565985
v 68.29346418 -41.58312022 -69.4721631
v -201.22561455 -52.22476169 399.69068424
v -257.2281599 -9.91782666 -556.12830954
v -602.89177895 -30.55787717 -38.71364096
v -358.32438469 1564.68943992 -34.19375878
v -311.17851734 1588.72429004 -227.39390984
v -679.52337265 1637.26954827 -270.19131632
v -756.1674118 1625.77894246 -114.91236948
v -1131.20365143 1177.73998732 497.21808319
v 941.73603058 300.32227003 144.137119
v 915.0349617 88.84019957 6.43975405
v 934.22546387 86.75471133 -98.41011984
v -880.22651672 1284.24709568 483.52525769
v -924.65343475 45.00533181 502.26797324
v 132.70027637 1468.57080447 -0.78006778
v 1.24678714 1481.42566381 -18.37851103
v 120.18427849 1498.69539492 131.26853129
v 145.02675533 470.95855304 -668.99087949
v 319.12732124 1089.78643231 573.9050997
v 453.8599968 1070.2328532 493.34327428
v 426.17259026 1127.99175628 490.71703653
v 393.99497509 1170.52754855 554.58936694
v 454.68730927 1118.83774619 635.40855299
v 423.20747375 1195.86554974 671.28619738
v -364.041996 915.32598966 -790.62333714
v -401.01461411 1127.66329445 -780.66014542
v 154.00750637 1072.74978795 -692.76779486
v 307.54776001 817.21754896 635.82550086
v -1678.84979248 487.29650424 -472.76976895
v -1531.33106232 455.94776632 -673.07136335
v -1626.08337402 370.12953817 -435.4096062
v 1022.92470932 1240.9152206 692.80065347
v 876.06830597 1279.46292529 681.08089583
v 831.62622452 420.95057652 419.87459954
v 737.72377968 733.02992702 519.56145742
v 834.79070663 283.2482275 546.72351037
v 896.14553452 1732.72932769 -73.12016107
v 737.07962036 1745.26692527 66.90713343
v 908.06941986 1769.42235357 80.88868043
v 1220.09620667 1255.13363826 57.77216371
v 1239.13078308 1161.03612852 114.16009822
v 1207.8163147 1162.33635603 40.18540519
v -1451.91173553 162.49076755 -181.00748325
v -1668.46389771 375.10219261 -253.35253628
v 853.33337784 669.63055818 188.32790671
v 860.63165665 438.90765311 183.03526642
v 534.06376839 1639.97995126 101.66873439
v -8.58665183 1436.63439718 290.66772897
v -201.22561455 -52.22476169 399.69068424
v -1588.66920471 805.56300364 187.94876326
v -1676.84497833 848.46216345 -225.37981982
v -1728.46031189 640.37943929 -228.65513267
v 622.94569016 1702.5290104 348.93859305
v 794.18745041 1767.38150393 163.08206136
v 630.2271843 1731.62653446 146.30443256
v 954.97913361 933.33604572 453.49782997
v 1054.71534729 918.1990254 358.55733694
v 1164.78176117 1061.62594458 506.10815872
v 634.15727615 -21.45581865 -38.02727111
v -1493.27144623 1079.78690364 188.90155843
v -1403.62415314 987.5854168 386.36639718
v 154.00750637 1072.74978795 -692.76779486
v 899.10297394 1383.90478612 -321.86888353
v 802.74209976 1094.45077877 -469.47039315
v 696.30146027 1215.17575862 -373.04573783
v -858.96558762 965.27701666 661.58035764
v 822.18532562 1531.89268376 601.54689627
v 945.31440735 1367.21801842 590.55883067
v 1020.18718719 1391.42627948 599.58358984
v -401.01461411 1127.66329445 -780.66014542
v -994.08283234 901.37076341 -880.31773947
v 495.47977448 1022.89458983 -483.37047076
v 538.32159042 945.05225729 -493.2508101
v -1431.65874481 1244.48673711 -439.85825787
v -1270.53260803 1267.56095111 -632.92628912
v -1597.44901657 878.24079328 -479.66694835
v -1040.62871933 1292.17288516 -730.3583343
v 1084.85469818 1604.05107152 329.95364759
v 1121.38805389 1603.29630969 182.80773268
v 1048.17676544 1654.68217902 120.27880413
v 973.53181839 1613.35095216 515.17732085
v 938.75274658 1669.62018974 351.6801975
v 854.44288254 1672.81596566 433.21162627
v -856.66675568 1114.20278856 604.21887365
v 209.49282646 1087.99714695 564.06418241
v 717.06838608 844.95771306 462.00528684
v 765.26112556 629.91276457 -544.27576791
v -103.05415392 679.20120694 -674.5065842
v 163.9146328 689.94788363 -632.04194819
v -949.27310944 695.32768078 691.9030964
v -1379.07600403 482.19858737 -784.69169843
v -1109.05170441 593.12076695 -870.29457219
v -1014.24121857 432.60527653 -816.93637267
v -1729.82578278 502.25811884 -238.7306078
v -1661.39755249 380.3628697 -137.80855177
v 43.99699867 1755.69140895 438.03548819
v 127.84935236 1639.83426915 343.07682024
v 167.74127483 1680.91323617 453.84084019
v 314.68348503 1600.93463267 195.42956496
v 556.54144287 1601.31960087 595.88101047
v 377.18834877 1630.48505174 547.9970183
v 317.89035797 1590.72627481 552.19796014
v -1528.99103165 1204.3192664 -122.4189813
v -1502.20489502 1236.81703136 -260.66018228
v 802.74209976 1094.45077877 -469.47039315
v -1253.28521729 934.6477126 -820.1535794
v -1040.62871933 1292.17288516 -730.3583343
v 434.83095169 1278.630465 693.47441823
v 466.46032333 1173.09343328 701.81493721
v 249.0247488 1522.79298758 466.80640207
v 1021.81911469 1688.05346726 -278.10765589
v 1016.42017365 1702.73743464 48.35230683
v 1023.26622009 1617.14857541 -90.09806038
v 983.46252441 1633.8866686 -307.80108368
v 934.60903168 1637.18065276 -350.34318417
v 1004.58345413 1844.70913076 -459.56026567
v 963.9837265 1528.12762294 -290.64222437
v 910.36968231 1567.71149458 -303.58568937
v 372.40433693 1461.76509202 545.12648609
v 472.95694351 1493.1550969 578.85317318
v 505.47423363 1682.44710012 295.3271509
v 309.98897552 1690.08888931 276.28875854
v 576.49021149 1495.18880909 589.34754807
v 906.11095428 1745.81676274 -246.98295426
v 900.8231163 1704.33039457 -305.48478714
v 966.99695587 1762.01247242 -56.91595174
v 1095.83511353 1348.01242473 -138.85449675
v 1013.94462585 1381.26731463 -259.28855988
v 1069.66428757 1494.39523779 -112.01966314
v 1076.56021118 1395.96756415 494.89399101
v 1101.97963715 1372.7446309 433.71502446
v 1041.09277725 1542.92314355 457.60525362
v 1052.80704498 1460.06192944 572.03826959
v 1129.67586517 1280.755152 668.85460015
v 1232.59420395 1418.63367839 163.63163724
v 1251.48601532 1324.86536827 166.2123429
v 1022.84822464 1257.70488018 -278.37079988
v 1106.64234161 1263.27121609 -124.77375585
v 1004.65478897 1080.93560826 -372.5138518
v 706.75477982 1609.78631793 574.31185245
v 711.59658432 1510.77442675 616.42817679
v 1113.06266785 1503.42492916 -8.64626449
v 1202.98776627 1506.31230465 182.37222926
v 907.74316788 1716.81483554 193.08849021
v 796.59347534 1765.96604977 97.17820722
v 539.83879089 1681.23572065 158.1526759
v 1080.42221069 994.12638077 -211.62926658
v 1091.09239578 1151.48293814 -156.02743312
v 1118.71528625 1109.03099749 -74.80888554
v 175.46253204 1720.69516712 325.19689183
v 967.64450073 982.38048128 559.26235406
v 1077.34565735 1026.36156122 587.82007662
v 614.0996933 1177.12681527 746.06261149
v 582.56840706 1253.6485941 750.49151023
v 1215.65694809 1119.75951605 317.84494753
v 1068.66760254 931.64991546 244.419566
v 1121.13580704 1011.21341103 80.10440087
v 614.0996933 1177.12681527 746.06261149
v 427.28462219 1407.29522911 598.01016768
v 775.12531281 1641.45944462 -125.25635282
v 853.33890915 262.68485246 186.47549641
v 838.0657196 288.91747236 160.97285809
v 893.70222092 394.53135612 65.99031816
v 845.83587646 128.80113076 143.36226272
v 793.40643883 15.14948679 77.61001936
v 911.97004318 261.57525114 178.74208003
v 992.53473282 319.5746919 12.51192102
v 982.6587677 432.4609201 -48.2515682
v 538.82408142 -41.00545857 499.17584134
v 892.92135239 33.07491297 350.91022906
v 830.79624176 28.88661884 528.22350985
v 892.21220016 67.22412395 -275.12200974
v 424.71985817 191.91733671 589.78487703
v 367.41936207 584.4433376 627.33793274
v 66.3665235 489.03857823 680.21747251
v -924.97491837 201.71048962 -712.02853628
v -466.18690491 475.70235265 -760.20820738
v -460.67504883 189.08295386 -746.76278334
v 365.33551216 1400.66181031 -243.45683029
v 137.98136711 1437.56415125 -190.47636565
v -1292.91687012 25.4820924 207.93435158
v -1440.71531296 182.00422237 201.81700602
v 1086.48614883 937.48836465 -3.24136987
v 613.02270889 -24.06076654 -394.16455831
v 83.74310732 -37.46983346 -544.90460739
v 703.41095924 454.19802646 -586.59360656
v 648.35691452 186.48710307 -581.91531359
v -415.19927979 1058.78210825 631.82880318
v -869.99483109 -28.4383599 399.98364912
v -870.1505661 79.589193 -628.46104011
v -1146.11845016 200.61129452 -651.15016391
v 700.91257095 265.76559996 613.13701114
v 732.49497414 48.40023786 601.84983419
v 489.61172104 -14.72072544 588.852551
v 904.72917557 254.97164969 -424.12342411
v 837.03327179 89.2087039 -404.45529484
v 605.60102463 17.00146932 -540.30676165
v 605.60102463 17.00146932 -540.30676165
v 837.03327179 89.2087039 -404.45529484
v 892.21220016 67.22412395 -275.12200974
v -461.65857315 41.14447141 -700.93565658
v -257.2281599 -9.91782666 -556.12830954
v -444.00053024 -11.85652699 -554.04481695
v 172.21355438 1372.20660628 -501.16036837
v 96.38358951 -76.70453079 409.32565985
v -1537.18099594 631.20315625 -697.95723708
v -1379.61158752 647.14866741 -813.20563369
v -1460.68115234 886.70452344 -688.55724476
v -1379.61158752 647.14866741 -813.20563369
v 877.0483017 973.25822534 -486.47896411
v 978.28407288 713.64843258 -475.06682579
v 580.65943718 857.25356312 -513.92116208
v 1004.65478897 1080.93560826 -372.5138518
v 1080.42221069 994.12638077 -211.62926658
v 978.28407288 713.64843258 -475.06682579
v 877.0483017 973.25822534 -486.47896411
v 740.71097374 954.73946012 492.50177088
v 568.8999176 1057.76406028 627.95249872
v 540.43998718 913.75788109 491.25179663
v 489.27202225 709.65094858 603.24075581
v -91.10192657 619.42065315 765.64697664
v 157.89241791 866.10039241 -672.74536892
v -513.83476257 655.25423586 -786.59430689
v -1003.31306458 -33.67120072 216.7783792
v -1595.86963654 466.66076343 156.16840866
v -1226.56230927 1483.54030932 -214.32261795
v -997.33171463 1595.18133823 -193.65000488
v 934.22546387 86.75471133 -98.41011984
v 915.0349617 88.84019957 6.43975405
v -47.05353677 1518.53996206 -238.49364225
v 987.45937347 750.4060772 16.43562906
v 982.07845688 872.0055854 168.09258559
v -1679.89253998 626.07423689 -474.02082153
v -1492.72127151 175.94288825 -58.60316044
v -1316.13616943 46.07884521 -22.26304567
v -1019.67735291 96.07677716 -569.65629236
v 904.72917557 254.97164969 -424.12342411
v 986.88488007 259.76718125 -252.62956083
v 892.21220016 67.22412395 -275.12200974
v 837.03327179 89.2087039 -404.45529484
v 972.46990204 494.34959412 -468.25235791
v 57.31090903 22.01581581 -696.1329496
v 959.06982422 1178.29831537 -384.34810762
v 877.0483017 973.25822534 -486.47896411
v -438.06552887 923.73726358 731.06397838
v 819.92988586 970.15037182 563.57925822
v 673.59657288 1049.19406458 675.85804058
v 793.40643883 15.14948679 77.61001936
v 1041.47138596 808.48203656 -234.31915104
v -257.2281599 -9.91782666 -556.12830954
v 892.92135239 33.07491297 350.91022906
v 982.07845688 872.0055854 168.09258559
v -1407.36427307 1367.56016418 -194.84806884
v -401.01461411 1127.66329445 -780.66014542
v 381.91413879 1255.15622744 563.94179876
v 447.94640541 1106.38210853 -434.13490201
v 696.30146027 1215.17575862 -373.04573783
v -401.01461411 1127.66329445 -780.66014542
v 972.46990204 494.34959412 -468.25235791
v -994.08283234 901.37076341 -880.31773947
v -1253.28521729 934.6477126 -820.1535794
v -693.11761856 1299.98652583 -753.30755432
v 1192.42477417 1470.51891291 231.92367438
v 730.04674911 1306.02133213 727.9268998
v 692.83704758 1387.18367869 661.83592131
v 459.52243805 1322.65760347 697.86736874
v 982.07845688 872.0055854 168.09258559
v 285.53152084 1111.87519784 863.1037808
v 543.08681488 913.50190148 994.20532603
v 760.78205109 1083.32019176 897.90641301
v 574.74889755 1211.65049963 786.16184521
v 567.5989151 673.61055405 938.46291058
v 784.50546265 813.17341827 762.36816509
v 1000.71229935 1064.13918303 632.11824246
v 969.75259781 1193.86627162 700.25891881
v 884.32760239 1268.81419906 688.3351643
v 1483.25881958 1154.77599293 -49.37474766
v 1286.71188354 1227.2332617 261.19479212
v 1328.87563705 1138.99018161 401.97601835
v 1593.31417084 971.61875964 73.18843271
v 1273.15292358 927.02289929 372.58648074
v 1515.18230438 811.29791475 130.30727997
v 1152.17428207 1157.94296003 569.2925474
v 1108.05034637 1032.02551221 488.71571893
v 1139.02578354 1278.70701618 516.30509525
vn -0.05008 -0.96701 -0.24977
vn -0.2434 -0.93081 -0.27267
vn -0.02573 -0.75709 -0.6528
vn -0.2631 0.24583 0.93292
vn -0.35607 0.54468 0.7593
vn -0.56481 0.33476 0.75427
vn -0.26284 0.41822 -0.86949
vn -0.06596 0.1794 -0.98156
vn -0.13912 0.13297 -0.98131
vn 0.9188 -0.33571 0.20762
vn 0.97358 -0.19828 0.11325
vn 0.87802 -0.26785 0.39665
vn 0.10222 0.76917 0.63082
vn 0.17723 0.88153 0.4376
vn 0.00288 0.89367 0.44871
vn -0.38243 -0.54928 -0.743
vn -0.50157 -0.80577 -0.31489
vn -0.70335 -0.53459 -0.46853
vn -0.53861 -0.54668 0.64112
vn -0.21659 -0.70284 0.67757
vn -0.28197 -0.40025 0.87195
vn -0.30446 0.67342 -0.67365
vn -0.42689 0.4199 -0.8009
vn -0.06555 0.55747 0.8276
vn 0.17224 0.58387 0.79337
vn -0.87568 0.18666 0.44535
vn -0.44954 -0.25205 0.85696
vn -0.50454 -0.57718 0.64211
vn -0.05254 -0.94404 0.32562
vn -0.72789 -0.68105 0.07965
vn -0.40147 -0.90885 0.11318
vn 0.99578 0.0511 -0.07629
vn 0.88748 -0.44967 -0.1009
vn 0.94586 0.12393 -0.29998
vn -0.23824 0.8028 0.54658
vn -0.75108 0.47672 0.45675
vn -0.23669 0.9292 0.28383
vn 0.33217 0.78822 0.51805
vn 0.2893 0.72062 0.63009
vn -0.0538 0.90407 0.42398
vn 0.15094 0.98659 -0.06206
vn 0.08237 0.75681 -0.64842
vn 0.04969 0.99376 -0.09986
vn -0.02869 0.17578 -0.98401
vn 0.00471 0.18819 -0.98212
vn 0.40847 0.75673 0.5104
vn 0.30888 0.28943 0.90599
vn 0.13484 0.35149 0.92643
vn 0.02124 -0.97376 -0.2266
vn -0.03757 -0.75169 -0.65845
vn -0.06747 -0.72902 -0.68116
vn -0.127 -0.89777 0.42175
vn 0.01642 -0.7193 0.6945
vn 0.00827 -0.83155 0.55539
vn -0.26505 -0.60498 0.75083
vn -0.26507 -0.86637 0.42326
vn 0.00687 -0.90602 0.42317
vn -0.75841 -0.64708 0.07812
vn -0.53385 -0.84403 -0.05115
vn -0.48009 -0.84911 0.22028
vn -0.76278 -0.62218 -0.17625
vn 0.69298 0.71981 0.04055
vn 0.98636 0.06362 -0.15183
vn 0.12356 -0.89882 0.42055
vn 0.13169 -0.98458 0.11512
vn 0.14503 -0.91809 0.36888
vn -0.07333 -0.99582 0.05445
vn 0.20101 -0.97844 0.04743
vn 0.10321 -0.85821 -0.50282
vn 0.2338 -0.63883 -0.73296
vn -0.59552 -0.28694 0.75035
vn 0.03743 -0.44833 0.89308
vn -0.014 -0.48451 0.87467
vn -0.03794 -0.6217 0.78234
vn 0.13367 -0.17836 -0.97484
vn -0.02234 -0.11589 -0.99301
vn -0.00388 0.03346 -0.99943
vn -0.06862 -0.19232 -0.97893
vn -0.03461 0.05395 -0.99794
vn 0.12146 -0.26357 0.95696
vn 0.202 0.0363 0.97871
vn 0.02047 0.07345 0.99709
vn -0.03168 -0.22147 0.97465
vn -0.39086 -0.80006 0.45512
vn 0.64796 -0.72697 0.2273
vn 0.74907 -0.22827 -0.62192
vn 0.78828 0.01908 -0.61502
vn -0.02271 -0.72251 0.69098
vn -0.15441 -0.72463 -0.67161
vn -0.01933 0.23675 0.97138
vn 0.14338 -0.08446 0.98606
vn -0.3083 0.04082 0.95041
vn 0.1469 0.98138 0.12378
vn 0.15735 -0.93368 0.32168
vn -0.16674 -0.94455 -0.28287
vn -0.14607 -0.86646 -0.4774
vn -0.59686 -0.73648 -0.31836
vn -0.64419 -0.454 -0.61555
vn -0.81382 -0.52093 -0.25756
vn 0.18396 0.98171 -0.04906
vn 0.13267 0.96859 0.21031
vn 0.3556 0.91192 0.20484
vn 0.3068 -0.93223 0.19188
vn -0.89448 0.37566 -0.24244
vn -0.64729 0.62603 -0.43486
vn -0.70517 0.31225 -0.63658
vn 0.16247 -0.9784 0.1278
vn 0.20543 -0.84124 0.50011
vn 0.98044 -0.1586 0.11656
vn 0.67211 -0.67431 0.30589
vn 0.78286 -0.61545 0.09141
vn -0.43953 0.21758 0.87148
vn -0.33041 0.39282 0.85821
vn 0.23143 -0.10782 0.96686
vn 0.89418 0.43724 0.09628
vn 0.93027 0.18668 -0.31584
vn 0.8615 0.42965 -0.27058
vn -0.55782 0.20206 -0.80499
vn -0.81266 0.08167 -0.57699
vn 0.8646 -0.4968 -0.07522
vn 0.94024 -0.31061 -0.13955
vn -0.36467 0.43752 0.82195
vn -0.19628 -0.34225 0.91888
vn -0.9042 -0.39814 0.15461
vn -0.94945 0.0192 0.31333
vn -0.99253 -0.03991 0.11532
vn -0.15086 -0.27594 0.94926
vn 0.0127 -0.16307 0.98653
vn -0.36455 0.195 0.91054
vn 0.11476 -0.25453 -0.96023
vn 0.4404 -0.20816 -0.87334
vn 0.78985 -0.33697 -0.51243
vn 0.17919 0.02328 -0.98354
vn -0.81523 -0.38764 0.43027
vn -0.70377 -0.62554 0.33675
vn 0.15402 0.94547 0.28699
vn 0.10544 0.93218 0.34629
vn -0.15209 0.83073 0.5355
vn -0.17871 -0.93162 0.31647
vn 0.17215 -0.91626 0.36171
vn 0.02679 -0.95113 0.30761
vn -0.06884 -0.93279 0.35378
vn -0.02329 0.99185 0.12527
vn 0.28418 0.86705 0.40923
vn 0.23008 0.95895 0.16576
vn -0.74399 0.3999 0.53531
vn -0.5442 0.63738 0.54552
vn -0.85455 0.39088 0.34198
vn -0.21844 0.82757 0.51712
vn 0.679 -0.31138 0.66484
vn 0.68748 0.05006 0.72448
vn 0.68428 0.01388 0.72909
vn 0.43543 -0.55887 0.70573
vn 0.35541 -0.22514 0.90719
vn 0.13416 -0.35917 0.92358
vn -0.10019 -0.85364 0.51114
vn -0.04458 -0.90585 0.42125
vn 0.63404 -0.7725 -0.03518
vn 0.23713 0.9673 0.08996
vn 0.18313 0.98051 -0.07116
vn 0.1857 0.98257 0.00837
vn -0.25384 -0.96706 0.01875
vn -0.38928 0.83375 -0.39157
vn -0.06576 0.98613 -0.15239
vn -0.02737 0.94483 -0.3264
vn -0.98114 -0.0334 -0.1904
vn -0.86132 -0.15116 -0.48505
vn -0.76685 -0.39113 0.50887
vn -0.84829 0.42384 -0.31742
vn -0.39561 -0.82251 0.40863
vn -0.4212 0.43059 0.79824
vn -0.01831 -0.85571 0.51713
vn -0.07137 -0.64404 0.76166
vn -0.41648 -0.90616 0.07355
vn -0.85531 -0.14127 0.49849
vn -0.8326 0.17406 0.52581
vn -0.3611 0.89426 0.2644
vn -0.70424 -0.70474 0.08595
vn -0.45986 -0.79777 -0.38999
vn -0.71888 -0.65999 -0.21825
vn 0.98462 0.12732 -0.11964
vn 0.78002 -0.07334 0.62144
vn 0.97052 0.17201 0.16882
vn 0.79709 0.47558 -0.37212
vn -0.24468 0.90382 -0.35107
vn 0.20236 0.77803 0.59474
vn 0.65221 0.7576 -0.02582
vn -0.41689 0.9076 -0.04953
vn -0.54157 -0.83475 -0.0995
vn -0.19234 -0.97532 0.10847
vn -0.19319 -0.04576 0.98009
vn -0.14836 0.45618 0.87743
vn -0.15961 -0.92977 0.33174
vn -0.83955 0.0121 0.54315
vn -0.91662 0.35947 0.17489
vn 0.29712 -0.01207 0.95476
vn 0.87281 0.46676 0.1426
vn 0.73173 0.65097 0.20201
vn 0.86118 0.39897 0.31495
vn 0.89499 -0.13921 0.4238
vn 0.78307 -0.35395 0.51139
vn 0.84696 -0.37555 0.37633
vn 0.66884 -0.59275 0.44868
vn 0.60792 -0.75606 0.2425
vn 0.94771 0.12299 0.29449
vn 0.98462 0.13042 0.11629
vn 0.76321 0.60939 0.21485
vn 0.88145 0.46911 0.05469
vn 0.73739 0.65355 0.17068
vn 0.01716 -0.73011 0.68311
vn -0.05531 -0.90967 0.41163
vn 0.79825 0.39489 0.45482
vn 0.88762 -0.00688 0.46053
vn 0.41607 -0.26034 0.87127
vn -0.1204 0.20946 0.97038
vn -0.41084 0.30252 0.86005
vn 0.95661 0.27627 -0.09261
vn 0.91884 0.39433 -0.01511
vn 0.902 0.32178 -0.28784
vn -0.11573 0.57702 0.80849
vn 0.24664 -0.26191 -0.93304
vn 0.51878 -0.5477 -0.65643
vn -0.09071 -0.96083 -0.26189
vn -0.11139 -0.98039 0.16256
vn 0.90621 -0.08533 -0.41413
vn 0.71124 0.00323 -0.70295
vn 0.82078 0.1101 -0.56054
vn -0.59818 -0.73008 0.33041
vn -0.42137 0.45349 0.78536
vn 0.84469 -0.45076 0.28865
vn 0.76083 -0.4835 0.43286
vn 0.77308 -0.61986 0.13461
vn 0.9671 -0.05725 -0.24788
vn 0.53683 0.02271 -0.84338
vn 0.46169 -0.88637 -0.03456
vn 0.97568 -0.21496 -0.0429
vn 0.96799 -0.24206 -0.06633
vn 0.84782 -0.02653 -0.52962
vn 0.67199 -0.46731 -0.5745
vn 0.67937 0.18425 -0.71028
vn 0.00153 -0.99569 -0.09272
vn 0.14652 -0.98088 -0.12808
vn 0.15038 -0.95934 -0.23884
vn -0.13 0.87118 -0.47343
vn 0.14285 0.98546 -0.09202
vn -0.03239 0.96481 -0.26096
vn -0.04386 0.46759 0.88285
vn 0.15628 0.15235 0.97589
vn -0.47031 -0.15453 -0.86886
vn -0.7683 -0.307 -0.56167
vn 0.91134 -0.02284 -0.41103
vn 0.22468 0.16166 -0.96093
vn 0.30522 0.95227 0.00564
vn 0.38284 0.90534 -0.18381
vn 0.06216 -0.80031 0.59636
vn -0.09595 -0.316 -0.94389
vn -0.18168 0.58406 -0.79112
vn 0.22749 -0.97344 0.02573
vn 0.26327 -0.85791 -0.44122
vn 0.02447 -0.78062 -0.62453
vn 0.74172 0.60679 -0.28576
vn 0.62188 0.51984 -0.58569
vn 0.33499 0.65946 -0.67297
vn -0.08621 0.68454 -0.72386
vn 0.41178 0.56435 0.7155
vn -0.72323 0.68744 0.06604
vn -0.4288 0.90329 0.01397
vn -0.69052 0.6451 0.32716
vn 0.39322 0.90306 0.17282
vn 0.19443 0.97409 0.1155
vn 0.11967 -0.584 -0.80288
vn -0.35063 -0.59887 -0.72001
vn 0.19282 -0.97917 -0.06366
vn 0.26113 -0.94898 0.17675
vn 0.09204 -0.98065 -0.17279
vn 0.26635 0.96249 -0.05172
vn 0.18051 0.97783 -0.10618
vn -0.13619 -0.02922 -0.99025
vn -0.89337 -0.39026 -0.22268
vn -0.49226 0.01302 0.87035
vn -0.29619 -0.08014 0.95176
vn 0.28325 0.08457 0.95531
vn 0.92685 -0.31741 -0.20048
vn 0.69049 -0.31979 -0.64881
vn -0.91655 0.3828 0.1158
vn -0.73095 -0.06371 -0.67945
vn -0.41558 0.0952 -0.90456
vn 0.75077 0.64965 -0.11962
vn 0.50921 0.80548 0.30315
vn -0.00549 -0.92639 0.37652
vn -0.06981 -0.39339 -0.91672
vn -0.20039 -0.6307 -0.74971
vn -0.67285 -0.00932 0.73972
vn -0.82001 -0.555 0.13987
vn 0.8505 -0.41326 0.32536
vn 0.14812 -0.88611 0.43916
vn 0.08998 -0.86932 0.48599
vn -0.41656 -0.81731 0.39811
vn -0.02546 -0.81855 0.57387
vn 0.38433 -0.90862 0.1634
vn 0.43209 -0.86423 0.25769
vn 0.04887 -0.78654 0.6156
vn 0.6261 -0.74771 -0.2212
vn 0.66235 -0.7134 -0.22881
vn 0.71217 -0.66012 -0.23885
vn 0.56105 -0.80298 0.20113
vn 0.18504 -0.71025 0.6792
vn 0.70814 -0.26511 0.65441
vn 0.694 -0.25768 0.67228
vn 0.75602 -0.60985 0.23771
vn 0.79223 -0.55315 0.25769
vn 0.61367 -0.73839 -0.27961
vn 0.68435 -0.70296 -0.1937
vn 0.63166 -0.77521 -0.00814
vn 0.49589 -0.77193 -0.39777
vn 0.68561 -0.53436 0.49436
vt 0.18021 0.3738
vt 0.08152 0.39624
vt 0.22626 0.27709
vt 0.31669 0.91274
vt 0.32826 0.89239
vt 0.2427 0.87737
vt 0.35446 0.5035
vt 0.4882 0.41426
vt 0.25881 0.4074
vt 0.78729 0.44848
vt 0.87204 0.49165
vt 0.8812 0.53352
vt 0.4904 0.85974
vt 0.58121 0.78655
vt 0.46563 0.83595
vt 0.10461 0.37002
vt 0.06432 0.41887
vt 0.07313 0.43185
vt 0.07873 0.77794
vt 0.09179 0.74349
vt 0.14269 0.82265
vt 0.34425 0.54469
vt 0.29216 0.5359
vt 0.40521 0.90094
vt 0.48058 0.87281
vt 0.48842 0.72342
vt 0.46976 0.71049
vt 0.45858 0.68368
vt 0.46933 0.52975
vt 0.49006 0.59566
vt 0.47887 0.63654
vt 0.88065 0.37446
vt 0.8062 0.32088
vt 0.85069 0.27439
vt 0.80533 0.74319
vt 0.85182 0.77068
vt 0.84504 0.7183
vt 0.7353 0.64077
vt 0.69974 0.70415
vt 0.77403 0.66481
vt 0.292 0.42785
vt 0.25836 0.33985
vt 0.26471 0.45629
vt 0.84058 0.43897
vt 0.87499 0.37858
vt 0.84496 0.37331
vt 0.68276 0.7365
vt 0.62286 0.77725
vt 0.45066 0.88686
vt 0.38562 0.22064
vt 0.31746 0.22994
vt 0.40727 0.16258
vt 0.37288 0.55815
vt 0.2883 0.6644
vt 0.38678 0.50673
vt 0.40659 0.68236
vt 0.39133 0.62633
vt 0.43905 0.62163
vt 0.02313 0.60907
vt 0.03538 0.51855
vt 0.02612 0.61518
vt 0.04131 0.51664
vt 0.62904 0.25726
vt 0.56901 0.3467
vt 0.61924 0.35917
vt 0.30522 0.44302
vt 0.28689 0.38319
vt 0.38653 0.44378
vt 0.17392 0.45768
vt 0.58105 0.45406
vt 0.59653 0.40146
vt 0.67254 0.3648
vt 0.11894 0.82095
vt 0.34725 0.76477
vt 0.21383 0.8086
vt 0.31836 0.71694
vt 0.62505 0.26694
vt 0.64289 0.36344
vt 0.74466 0.37214
vt 0.64514 0.42091
vt 0.55882 0.38681
vt 0.37116 0.3405
vt 0.39854 0.82725
vt 0.45007 0.85434
vt 0.36223 0.8997
vt 0.30422 0.88866
vt 0.05731 0.699
vt 0.76515 0.22258
vt 0.77601 0.18618
vt 0.8009 0.20281
vt 0.13946 0.69672
vt 0.14579 0.3271
vt 0.5425 0.74439
vt 0.44387 0.81944
vt 0.51043 0.74363
vt 0.34123 0.56499
vt 0.45897 0.49878
vt 0.52711 0.48869
vt 0.51868 0.5148
vt 0.4903 0.52323
vt 0.49268 0.48199
vt 0.47337 0.50856
vt 0.40067 0.7236
vt 0.41334 0.77338
vt 0.31973 0.61647
vt 0.44205 0.39211
vt 0.18546 0.64565
vt 0.26515 0.64721
vt 0.19148 0.60603
vt 0.69479 0.44052
vt 0.63459 0.47869
vt 0.66833 0.22261
vt 0.61511 0.31551
vt 0.63829 0.15108
vt 0.83303 0.78264
vt 0.74213 0.7831
vt 0.8013 0.77324
vt 0.91541 0.53438
vt 0.90327 0.48261
vt 0.91144 0.50418
vt 0.1784 0.51116
vt 0.14311 0.59101
vt 0.73492 0.34916
vt 0.73211 0.26846
vt 0.6501 0.75679
vt 0.42892 0.71056
vt 0.35083 0.23172
vt 0.0466 0.65714
vt 0.12486 0.73054
vt 0.11953 0.6688
vt 0.63151 0.74126
vt 0.72853 0.77182
vt 0.68271 0.7792
vt 0.70952 0.37813
vt 0.74507 0.3639
vt 0.78135 0.38303
vt 0.74424 0.25093
vt 0.05847 0.7344
vt 0.02922 0.67412
vt 0.67705 0.67848
vt 0.87089 0.67857
vt 0.85608 0.60387
vt 0.80705 0.64519
vt 0.08818 0.58401
vt 0.6431 0.60619
vt 0.6851 0.52147
vt 0.71084 0.51865
vt 0.35443 0.84391
vt 0.28161 0.78008
vt 0.67729 0.62685
vt 0.62021 0.62633
vt 0.21697 0.84212
vt 0.29993 0.85568
vt 0.19027 0.74803
vt 0.34797 0.86571
vt 0.81404 0.64607
vt 0.8631 0.66654
vt 0.84606 0.70127
vt 0.71881 0.63354
vt 0.75895 0.68727
vt 0.69274 0.69094
vt 0.10187 0.63688
vt 0.42719 0.52013
vt 0.62298 0.37637
vt 0.40892 0.60187
vt 0.32645 0.65341
vt 0.36299 0.63996
vt 0.07066 0.49997
vt 0.32149 0.6539
vt 0.16352 0.74156
vt 0.13119 0.67751
vt 0.12484 0.62941
vt 0.11885 0.57891
vt 0.40051 0.80917
vt 0.45507 0.76654
vt 0.44625 0.75996
vt 0.55343 0.74878
vt 0.53845 0.66714
vt 0.4854 0.70987
vt 0.46439 0.69728
vt 0.12394 0.8071
vt 0.15938 0.82814
vt 0.66945 0.60657
vt 0.33972 0.77451
vt 0.37958 0.85127
vt 0.47144 0.53449
vt 0.48031 0.49054
vt 0.4637 0.69045
vt 0.92264 0.78062
vt 0.85088 0.73647
vt 0.88429 0.7236
vt 0.91118 0.76632
vt 0.91028 0.78624
vt 0.96075 0.8665
vt 0.89728 0.72557
vt 0.88379 0.74744
vt 0.485 0.63956
vt 0.51566 0.63862
vt 0.60097 0.75314
vt 0.53498 0.77374
vt 0.55843 0.62584
vt 0.87528 0.80762
vt 0.88812 0.80401
vt 0.86244 0.78353
vt 0.91096 0.61634
vt 0.90228 0.65437
vt 0.89952 0.66766
vt 0.7597 0.53211
vt 0.79103 0.5285
vt 0.76759 0.6032
vt 0.73967 0.54974
vt 0.73935 0.44089
vt 0.90297 0.5859
vt 0.90886 0.54068
vt 0.90642 0.60958
vt 0.90897 0.57305
vt 0.91111 0.5635
vt 0.60125 0.65691
vt 0.57547 0.60894
vt 0.90066 0.63997
vt 0.89285 0.61615
vt 0.78079 0.73424
vt 0.75816 0.78519
vt 0.64157 0.76442
vt 0.88468 0.48262
vt 0.90483 0.54327
vt 0.89558 0.51043
vt 0.4756 0.79662
vt 0.6954 0.37415
vt 0.73111 0.36804
vt 0.50257 0.44164
vt 0.50506 0.49634
vt 0.8525 0.43553
vt 0.809 0.39987
vt 0.86662 0.45529
vt 0.51795 0.46318
vt 0.49179 0.6029
vt 0.77834 0.7609
vt 0.72435 0.2132
vt 0.72392 0.22966
vt 0.76462 0.27317
vt 0.72679 0.18214
vt 0.72082 0.16914
vt 0.74455 0.20684
vt 0.80496 0.24378
vt 0.81379 0.29488
vt 0.55412 0.10103
vt 0.69729 0.10409
vt 0.63774 0.07525
vt 0.8194 0.23307
vt 0.49297 0.17676
vt 0.46471 0.30524
vt 0.35807 0.3061
vt 0.11718 0.57533
vt 0.27381 0.60701
vt 0.20882 0.48618
vt 0.67048 0.72712
vt 0.58762 0.75589
vt 0.13093 0.40478
vt 0.09476 0.46311
vt 0.837 0.40884
vt 0.82278 0.25951
vt 0.84535 0.37387
vt 0.39145 0.52897
vt 0.32506 0.40868
vt 0.21773 0.56695
vt 0.18822 0.3181
vt 0.10659 0.51961
vt 0.34383 0.54341
vt 0.57718 0.15279
vt 0.58858 0.08147
vt 0.51343 0.10357
vt 0.3351 0.3433
vt 0.36169 0.24188
vt 0.31768 0.27266
vt 0.85955 0.30203
vt 0.84978 0.27405
vt 0.81906 0.23282
vt 0.17348 0.42002
vt 0.19309 0.32828
vt 0.14386 0.38997
vt 0.66428 0.76616
vt 0.43778 0.17787
vt 0.26022 0.69663
vt 0.31819 0.70058
vt 0.27103 0.7614
vt 0.31747 0.70173
vt 0.6054 0.58646
vt 0.51948 0.52284
vt 0.5155 0.637
vt 0.57005 0.42147
vt 0.58818 0.41358
vt 0.56991 0.35018
vt 0.547 0.41658
vt 0.62784 0.39452
vt 0.52142 0.42507
vt 0.55663 0.42069
vt 0.50659 0.32198
vt 0.29213 0.34672
vt 0.44082 0.67619
vt 0.31406 0.6674
vt 0.19674 0.35638
vt 0.06001 0.56022
vt 0.21153 0.88258
vt 0.25834 0.90049
vt 0.80169 0.20277
vt 0.77532 0.18699
vt 0.54081 0.80705
vt 0.81728 0.38741
vt 0.74137 0.38058
vt 0.18237 0.68369
vt 0.14324 0.49924
vt 0.17721 0.44361
vt 0.07225 0.49914
vt 0.53463 0.18433
vt 0.68927 0.15006
vt 0.67961 0.11212
vt 0.60112 0.10418
vt 0.38801 0.44412
vt 0.87463 0.37705
vt 0.90004 0.60562
vt 0.8832 0.55771
vt 0.18326 0.51089
vt 0.64043 0.38701
vt 0.55624 0.41992
vt 0.72168 0.16995
vt 0.88786 0.44314
vt 0.84023 0.43854
vt 0.66072 0.18714
vt 0.73809 0.37804
vt 0.16504 0.85551
vt 0.59012 0.73216
vt 0.48481 0.55573
vt 0.73557 0.6376
vt 0.78748 0.59421
vt 0.51881 0.78021
vt 0.53062 0.29291
vt 0.27478 0.78185
vt 0.32922 0.78373
vt 0.42572 0.84802
vt 0.87063 0.59291
vt 0.56622 0.50135
vt 0.57314 0.54666
vt 0.4799 0.56283
vt 0.74121 0.38125
vt 0.02295 0.53975
vt 0.07435 0.24568
vt 0.26865 0.41614
vt 0.2194 0.64301
vt 0.12575 -0.04839
vt 0.34313 0.08825
vt 0.50974 0.42801
vt 0.46295 0.5866
vt 0.41585 0.74628
vt 0.1021 0.63365
vt 0.29109 0.67441
vt 0.31687 0.43628
vt 0.06907 0.22236
vt 0.34473 0.16322
vt 0.13835 0.02249
vt 0.4875 0.50248
vt 0.51252 0.34697
vt 0.46231 0.65907
usemtl mat0
f 1/1/1 2/2/2 3/3/3
f 4/4/4 5/5/5 6/6/6
f 7/7/7 8/8/8 9/9/9
f 10/10/10 11/11/11 12/12/12
f 13/13/13 14/14/14 15/15/15
f 16/16/16 17/17/17 18/18/18
f 19/19/19 20/20/20 21/21/21
f 22/22/22 7/7/7 23/23/23
f 13/13/13 24/24/24 25/25/25
f 26/26/26 27/27/27 28/28/28
f 29/29/29 30/30/30 31/31/31
f 32/32/32 33/33/33 34/34/34
f 35/35/35 36/36/36 37/37/37
f 38/38/38 39/39/39 40/40/40
f 41/41/41 42/42/42 43/43/43
f 44/44/44 45/45/42 46/46/45
f 13/13/13 25/25/25 47/47/46
f 48/48/47 25/25/25 49/49/48
f 50/50/49 51/51/50 52/52/51
f 53/53/52 54/54/53 55/55/54
f 56/56/55 57/57/56 58/58/57
f 59/59/58 60/60/59 61/61/60
f 62/62/61 60/60/59 59/59/58
f 63/63/32 64/64/62 65/65/63
f 66/66/64 67/67/65 68/68/66
f 69/69/67 67/67/65 66/66/64
f 70/70/68 71/71/69 72/72/70
f 21/21/21 73/73/71 19/19/19
f 74/74/72 75/75/73 76/76/74
f 77/77/75 78/78/76 79/79/77
f 78/78/76 80/80/78 79/79/77
f 8/8/8 81/81/44 82/82/79
f 83/83/80 84/84/81 85/85/82
f 85/85/82 86/86/83 83/83/80
f 20/20/20 19/19/19 87/87/84
f 88/88/85 89/89/86 90/90/87
f 91/91/88 55/55/54 54/54/53
f 92/92/89 3/3/3 2/2/2
f 93/93/90 94/94/91 95/95/92
f 41/41/41 43/43/43 96/96/93
f 97/97/94 98/98/95 99/99/96
f 100/100/97 101/101/98 102/102/99
f 66/66/64 68/68/66 55/55/54
f 103/103/100 104/104/101 105/105/102
f 68/68/66 106/106/103 97/97/94
f 107/107/104 108/108/105 109/109/106
f 70/70/68 110/110/107 111/111/108
f 112/112/109 113/113/110 114/114/111
f 115/115/112 116/116/113 117/117/114
f 118/118/115 119/119/116 120/120/117
f 83/83/80 94/94/91 84/84/81
f 121/121/118 122/122/119 109/109/106
f 123/123/120 124/124/121 33/33/33
f 82/82/79 9/9/9 8/8/8
f 95/95/92 125/125/122 93/93/90
f 112/112/109 124/124/121 123/123/120
f 126/126/123 95/95/92 94/94/91
f 127/127/78 82/82/79 81/81/44
f 112/112/109 123/123/120 113/113/110
f 128/128/124 129/129/125 130/130/126
f 131/131/127 132/132/128 133/133/129
f 134/134/130 135/135/131 136/136/132
f 27/27/27 95/95/92 126/126/123
f 79/79/77 137/137/133 77/77/75
f 19/19/19 138/138/134 139/139/135
f 47/47/46 140/140/102 14/14/14
f 141/141/136 142/142/137 143/143/138
f 144/144/139 87/87/84 61/61/60
f 145/145/140 146/146/141 147/147/142
f 15/15/15 148/148/101 149/149/143
f 140/140/102 150/150/144 151/151/145
f 152/152/146 153/153/147 154/154/148
f 155/155/149 5/5/5 24/24/24
f 143/143/138 38/38/38 40/40/40
f 14/14/14 13/13/13 47/47/46
f 156/156/150 157/157/151 158/158/152
f 159/159/153 160/160/154 161/161/155
f 162/162/156 87/87/84 144/144/139
f 97/97/94 163/163/157 55/55/54
f 113/113/110 123/123/120 164/164/158
f 165/165/159 166/166/160 167/167/161
f 168/168/162 1/1/1 69/69/67
f 169/169/163 170/170/164 171/171/165
f 172/172/166 122/122/119 173/173/167
f 174/174/168 175/175/169 176/176/170
f 177/177/171 27/27/27 26/26/26
f 178/178/172 179/179/173 180/180/174
f 97/97/94 55/55/54 68/68/66
f 61/61/60 139/139/135 59/59/58
f 129/129/125 181/181/175 182/182/176
f 183/183/137 151/151/145 150/150/144
f 184/184/177 153/153/147 185/185/149
f 186/186/178 102/102/99 187/187/179
f 28/28/28 188/188/180 26/26/26
f 189/189/181 190/190/182 191/191/183
f 192/192/184 193/193/185 194/194/186
f 195/195/187 196/196/188 193/193/185
f 27/27/27 177/177/171 95/95/92
f 197/197/189 198/198/190 180/180/174
f 198/198/190 178/178/172 180/180/174
f 199/199/191 179/179/173 178/178/172
f 199/199/191 200/200/192 179/179/173
f 198/198/190 201/201/193 178/178/172
f 31/31/31 188/188/180 28/28/28
f 115/115/112 202/202/194 203/203/195
f 36/36/36 115/115/112 203/203/195
f 192/192/184 195/195/187 193/193/185
f 189/189/181 192/192/184 194/194/186
f 191/191/183 195/195/187 192/192/184
f 196/196/188 203/203/195 193/193/185
f 196/196/188 195/195/187 141/141/136
f 37/37/37 196/196/188 141/141/136
f 115/115/112 117/117/114 204/204/196
f 204/204/196 117/117/114 190/190/182
f 190/190/182 189/189/181 204/204/196
f 177/177/171 26/26/26 200/200/192
f 188/188/180 175/175/169 26/26/26
f 205/205/197 206/206/198 207/207/199
f 208/208/200 209/209/201 210/210/202
f 211/211/203 208/208/200 210/210/202
f 147/147/142 110/110/107 212/212/204
f 213/213/205 214/214/206 118/118/115
f 215/215/207 216/216/208 217/217/209
f 145/145/140 218/218/210 219/219/211
f 176/176/170 180/180/174 179/179/173
f 176/176/170 188/188/180 180/180/174
f 176/176/170 175/175/169 188/188/180
f 220/220/212 158/158/152 221/221/213
f 159/159/153 145/145/140 211/211/203
f 156/156/150 158/158/152 222/222/214
f 190/190/182 207/207/199 191/191/183
f 190/190/182 158/158/152 207/207/199
f 210/210/202 156/156/150 159/159/153
f 218/218/210 178/178/172 201/201/193
f 221/221/213 157/157/151 156/156/150
f 211/211/203 212/212/204 208/208/200
f 136/136/132 10/10/10 212/212/204
f 131/131/127 133/133/129 199/199/191
f 12/12/12 214/214/206 213/213/205
f 223/223/215 116/116/113 133/133/129
f 224/224/216 116/116/113 125/125/122
f 117/117/114 158/158/152 190/190/182
f 117/117/114 116/116/113 223/223/215
f 225/225/217 226/226/218 227/227/219
f 115/115/112 204/204/196 202/202/194
f 194/194/186 203/203/195 202/202/194
f 228/228/220 175/175/169 174/174/168
f 228/228/220 200/200/192 175/175/169
f 200/200/192 26/26/26 175/175/169
f 72/72/70 229/229/221 230/230/222
f 187/187/179 231/231/223 232/232/224
f 118/118/115 216/216/208 213/213/205
f 233/233/225 11/11/11 10/10/10
f 11/11/11 119/119/116 214/214/206
f 233/233/225 234/234/226 235/235/227
f 110/110/107 72/72/70 212/212/204
f 199/199/191 178/178/172 131/131/127
f 223/223/215 132/132/128 117/117/114
f 161/161/155 218/218/210 159/159/153
f 70/70/68 72/72/70 110/110/107
f 71/71/69 70/70/68 236/236/223
f 227/227/219 226/226/218 120/120/117
f 197/197/189 30/30/30 237/237/228
f 200/200/192 176/176/170 179/179/173
f 200/200/192 228/228/220 176/176/170
f 228/228/220 174/174/168 176/176/170
f 202/202/194 204/204/196 194/194/186
f 193/193/185 203/203/195 194/194/186
f 189/189/181 194/194/186 204/204/196
f 238/238/229 125/125/122 115/115/112
f 199/199/191 177/177/171 200/200/192
f 239/239/230 240/240/231 112/112/109
f 240/240/231 124/124/121 112/112/109
f 241/241/232 124/124/121 240/240/231
f 242/242/233 243/243/234 244/244/235
f 88/88/85 245/245/236 246/246/237
f 247/247/75 248/248/238 249/249/239
f 245/245/236 250/250/240 34/34/34
f 109/109/106 108/108/105 23/23/23
f 23/23/23 121/121/118 109/109/106
f 133/133/129 116/116/113 224/224/216
f 251/251/241 252/252/242 253/253/243
f 253/253/243 50/50/49 251/251/241
f 254/254/244 171/171/165 255/255/245
f 255/255/245 256/256/246 254/254/244
f 257/257/247 48/48/47 258/258/248
f 259/259/249 16/16/16 18/18/18
f 18/18/18 260/260/250 259/259/249
f 261/261/251 225/225/217 227/227/219
f 262/262/252 137/137/133 79/79/77
f 79/79/77 263/263/45 262/262/252
f 96/96/93 264/264/253 265/265/254
f 265/265/254 41/41/41 96/96/93
f 49/49/48 85/85/82 84/84/81
f 266/266/255 55/55/54 91/91/88
f 91/91/88 162/162/156 266/266/255
f 2/2/2 17/17/17 16/16/16
f 16/16/16 92/92/89 2/2/2
f 267/267/256 92/92/89 16/16/16
f 75/75/73 21/21/21 20/20/20
f 20/20/20 91/91/88 75/75/73
f 254/254/244 268/268/257 7/7/7
f 7/7/7 269/269/22 254/254/244
f 114/114/111 270/270/258 271/271/259
f 271/271/259 249/249/239 114/114/111
f 49/49/48 25/25/25 24/24/24
f 251/251/241 272/272/260 271/271/259
f 271/271/259 270/270/258 251/251/241
f 247/247/75 249/249/239 271/271/259
f 271/271/259 272/272/260 247/247/75
f 265/265/254 273/273/261 274/274/262
f 274/274/262 275/275/263 265/265/254
f 262/262/252 276/276/263 277/277/262
f 277/277/262 278/278/240 262/262/252
f 35/35/35 37/37/37 40/40/40
f 40/40/40 39/39/39 35/35/35
f 279/279/264 42/42/42 280/280/44
f 280/280/44 281/281/8 279/279/264
f 256/256/246 43/43/43 42/42/42
f 42/42/42 279/279/264 256/256/246
f 267/267/256 127/127/78 51/51/50
f 51/51/50 3/3/3 267/267/256
f 282/282/265 25/25/25 48/48/47
f 47/47/46 25/25/25 282/282/265
f 52/52/51 51/51/50 127/127/78
f 127/127/78 283/283/76 52/52/51
f 163/163/157 58/58/57 57/57/56
f 57/57/56 53/53/52 163/163/157
f 53/53/52 57/57/56 54/54/53
f 54/54/53 57/57/56 56/56/55
f 56/56/55 76/76/74 54/54/53
f 284/284/266 285/285/267 169/169/163
f 169/169/163 108/108/105 284/284/266
f 61/61/60 60/60/59 168/168/162
f 286/286/268 184/184/177 285/285/267
f 285/285/267 284/284/266 286/286/268
f 170/170/164 287/287/267 184/184/177
f 184/184/177 149/149/143 170/170/164
f 288/288/269 289/289/62 165/165/159
f 165/165/159 290/290/270 288/288/269
f 169/169/163 287/287/267 170/170/164
f 291/291/209 292/292/217 293/293/62
f 293/293/62 294/294/269 291/291/209
f 295/295/271 296/296/272 297/297/273
f 297/297/273 164/164/158 295/295/271
f 65/65/63 64/64/62 292/292/217
f 164/164/158 297/297/273 113/113/110
f 296/296/272 101/101/98 98/98/95
f 98/98/95 297/297/273 296/296/272
f 97/97/94 106/106/103 297/297/273
f 297/297/273 98/98/95 97/97/94
f 113/113/110 297/297/273 106/106/103
f 106/106/103 298/298/274 113/113/110
f 299/299/275 67/67/65 69/69/67
f 69/69/67 1/1/1 299/299/275
f 300/300/276 167/167/161 166/166/160
f 166/166/160 103/103/100 300/300/276
f 103/103/100 166/166/160 301/301/277
f 302/302/278 267/267/256 16/16/16
f 16/16/16 259/259/249 302/302/278
f 197/197/189 31/31/31 30/30/30
f 62/62/61 303/303/279 260/260/250
f 260/260/250 18/18/18 62/62/61
f 248/248/238 112/112/109 114/114/111
f 114/114/111 249/249/239 248/248/238
f 4/4/4 304/304/280 305/305/281
f 4/4/4 305/305/281 85/85/82
f 306/306/87 307/307/86 137/137/133
f 76/76/74 56/56/55 126/126/123
f 126/126/123 74/74/72 76/76/74
f 258/258/248 308/308/282 94/94/91
f 94/94/91 93/93/90 258/258/248
f 309/309/283 261/261/251 310/310/284
f 310/310/284 123/123/120 309/309/283
f 84/84/81 94/94/91 308/308/282
f 33/33/33 309/309/283 123/123/120
f 154/154/148 311/311/285 130/130/126
f 130/130/126 129/129/125 154/154/148
f 172/172/166 130/130/126 311/311/285
f 311/311/285 107/107/104 172/172/166
f 91/91/88 20/20/20 87/87/84
f 87/87/84 162/162/156 91/91/88
f 131/131/127 178/178/172 218/218/210
f 312/312/286 121/121/118 313/313/287
f 85/85/82 49/49/48 24/24/24
f 24/24/24 4/4/4 85/85/82
f 171/171/165 254/254/244 269/269/22
f 269/269/22 169/169/163 171/171/165
f 4/4/4 24/24/24 5/5/5
f 169/169/163 22/22/22 23/23/23
f 23/23/23 108/108/105 169/169/163
f 281/281/8 314/314/7 268/268/257
f 268/268/257 279/279/264 281/281/8
f 268/268/257 254/254/244 256/256/246
f 256/256/246 279/279/264 268/268/257
f 48/48/47 257/257/247 39/39/39
f 39/39/39 282/282/265 48/48/47
f 282/282/265 39/39/39 38/38/38
f 38/38/38 47/47/46 282/282/265
f 315/315/261 316/316/34 317/317/240
f 317/317/240 318/318/262 315/315/261
f 273/273/261 265/265/254 264/264/253
f 264/264/253 319/319/288 273/273/261
f 262/262/252 278/278/240 306/306/87
f 306/306/87 137/137/133 262/262/252
f 27/27/27 126/126/123 56/56/55
f 56/56/55 28/28/28 27/27/27
f 252/252/242 251/251/241 270/270/258
f 270/270/258 298/298/274 252/252/242
f 270/270/258 114/114/111 113/113/110
f 113/113/110 298/298/274 270/270/258
f 283/283/76 247/247/75 272/272/260
f 272/272/260 52/52/51 283/283/76
f 52/52/51 272/272/260 251/251/241
f 251/251/241 50/50/49 52/52/51
f 76/76/74 75/75/73 91/91/88
f 91/91/88 54/54/53 76/76/74
f 263/263/45 320/320/42 276/276/263
f 276/276/263 262/262/252 263/263/45
f 275/275/263 42/42/42 41/41/41
f 41/41/41 265/265/254 275/275/263
f 58/58/57 31/31/31 28/28/28
f 28/28/28 56/56/55 58/58/57
f 267/267/256 3/3/3 92/92/89
f 58/58/57 163/163/157 29/29/29
f 29/29/29 31/31/31 58/58/57
f 1/1/1 3/3/3 51/51/50
f 51/51/50 299/299/275 1/1/1
f 127/127/78 267/267/256 302/302/278
f 299/299/275 51/51/50 50/50/49
f 50/50/49 253/253/243 299/299/275
f 142/142/137 321/321/289 217/217/209
f 217/217/209 322/322/269 142/142/137
f 43/43/43 256/256/246 255/255/245
f 17/17/17 62/62/61 18/18/18
f 184/184/177 286/286/268 153/153/147
f 183/183/137 288/288/269 290/290/270
f 290/290/270 151/151/145 183/183/137
f 149/149/143 103/103/100 301/301/277
f 301/301/277 170/170/164 149/149/143
f 323/323/290 69/69/67 66/66/64
f 105/105/102 300/300/276 103/103/100
f 301/301/277 255/255/245 171/171/165
f 171/171/165 170/170/164 301/301/277
f 299/299/275 253/253/243 252/252/242
f 252/252/242 298/298/274 299/299/275
f 68/68/66 67/67/65 106/106/103
f 290/290/270 165/165/159 167/167/161
f 167/167/161 300/300/276 290/290/270
f 168/168/162 2/2/2 1/1/1
f 295/295/271 134/134/130 324/324/291
f 166/166/160 165/165/159 264/264/253
f 264/264/253 96/96/93 166/166/160
f 154/154/148 286/286/268 284/284/266
f 284/284/266 311/311/285 154/154/148
f 296/296/272 325/325/292 187/187/179
f 187/187/179 101/101/98 296/296/272
f 313/313/287 121/121/118 23/23/23
f 23/23/23 7/7/7 313/313/287
f 9/9/9 313/313/287 7/7/7
f 84/84/81 308/308/282 48/48/47
f 48/48/47 49/49/48 84/84/81
f 86/86/83 85/85/82 305/305/281
f 137/137/133 307/307/86 326/326/234
f 238/238/229 257/257/247 125/125/122
f 327/327/63 225/225/217 261/261/251
f 261/261/251 309/309/283 327/327/63
f 308/308/282 258/258/248 48/48/47
f 263/263/45 79/79/77 328/328/44
f 120/120/117 119/119/116 235/235/227
f 235/235/227 227/227/219 120/120/117
f 244/244/235 243/243/234 89/89/86
f 89/89/86 88/88/85 244/244/235
f 12/12/12 11/11/11 214/214/206
f 93/93/90 125/125/122 257/257/247
f 257/257/247 258/258/248 93/93/90
f 248/248/238 243/243/234 242/242/233
f 242/242/233 239/239/230 112/112/109
f 112/112/109 248/248/238 242/242/233
f 121/121/118 312/312/286 173/173/167
f 173/173/167 122/122/119 121/121/118
f 259/259/249 313/313/287 9/9/9
f 9/9/9 302/302/278 259/259/249
f 260/260/250 312/312/286 313/313/287
f 313/313/287 259/259/249 260/260/250
f 21/21/21 305/305/281 304/304/280
f 304/304/280 73/73/71 21/21/21
f 75/75/73 86/86/83 305/305/281
f 305/305/281 21/21/21 75/75/73
f 77/77/75 137/137/133 326/326/234
f 326/326/234 329/329/238 77/77/75
f 224/224/216 125/125/122 95/95/92
f 95/95/92 177/177/171 224/224/216
f 74/74/72 126/126/123 94/94/91
f 94/94/91 83/83/80 74/74/72
f 295/295/271 164/164/158 123/123/120
f 123/123/120 310/310/284 295/295/271
f 79/79/77 80/80/78 328/328/44
f 127/127/78 302/302/278 82/82/79
f 303/303/279 128/128/124 130/130/126
f 130/130/126 172/172/166 303/303/279
f 303/303/279 173/173/167 312/312/286
f 312/312/286 260/260/250 303/303/279
f 161/161/155 160/160/154 132/132/128
f 295/295/271 330/330/284 135/135/131
f 75/75/73 74/74/72 83/83/80
f 83/83/80 86/86/83 75/75/73
f 302/302/278 9/9/9 82/82/79
f 152/152/146 182/182/176 331/331/293
f 331/331/293 6/6/6 152/152/146
f 73/73/71 304/304/280 331/331/293
f 266/266/255 323/323/290 66/66/64
f 66/66/64 55/55/54 266/266/255
f 182/182/176 181/181/175 331/331/293
f 140/140/102 332/332/101 14/14/14
f 97/97/94 100/100/97 333/333/294
f 333/333/294 29/29/29 97/97/94
f 183/183/137 150/150/144 334/334/38
f 334/334/38 335/335/138 183/183/137
f 87/87/84 19/19/19 139/139/135
f 139/139/135 61/61/60 87/87/84
f 185/185/149 153/153/147 5/5/5
f 15/15/15 155/155/149 24/24/24
f 24/24/24 13/13/13 15/15/15
f 40/40/40 37/37/37 141/141/136
f 141/141/136 143/143/138 40/40/40
f 35/35/35 39/39/39 257/257/247
f 257/257/247 238/238/229 35/35/35
f 30/30/30 29/29/29 333/333/294
f 53/53/52 55/55/54 163/163/157
f 6/6/6 331/331/293 304/304/280
f 304/304/280 4/4/4 6/6/6
f 73/73/71 331/331/293 181/181/175
f 181/181/175 138/138/134 73/73/71
f 266/266/255 162/162/156 144/144/139
f 144/144/139 323/323/290 266/266/255
f 19/19/19 73/73/71 138/138/134
f 140/140/102 47/47/46 334/334/38
f 334/334/38 150/150/144 140/140/102
f 15/15/15 14/14/14 336/336/101
f 6/6/6 5/5/5 153/153/147
f 153/153/147 152/152/146 6/6/6
f 221/221/213 158/158/152 157/157/151
f 309/309/283 33/33/33 32/32/32
f 32/32/32 327/327/63 309/309/283
f 97/97/94 29/29/29 163/163/157
f 303/303/279 172/172/166 173/173/167
f 311/311/285 284/284/266 108/108/105
f 108/108/105 107/107/104 311/311/285
f 67/67/65 299/299/275 298/298/274
f 298/298/274 106/106/103 67/67/65
f 59/59/58 128/128/124 303/303/279
f 303/303/279 62/62/61 59/59/58
f 109/109/106 122/122/119 172/172/166
f 172/172/166 107/107/104 109/109/106
f 301/301/277 166/166/160 43/43/43
f 43/43/43 255/255/245 301/301/277
f 165/165/159 289/289/62 319/319/288
f 319/319/288 264/264/253 165/165/159
f 96/96/93 43/43/43 166/166/160
f 2/2/2 168/168/162 60/60/59
f 60/60/59 17/17/17 2/2/2
f 63/63/32 337/337/288 64/64/62
f 300/300/276 105/105/102 151/151/145
f 151/151/145 290/290/270 300/300/276
f 62/62/61 17/17/17 60/60/59
f 154/154/148 153/153/147 286/286/268
f 69/69/67 323/323/290 144/144/139
f 144/144/139 168/168/162 69/69/67
f 149/149/143 104/104/101 103/103/100
f 139/139/135 138/138/134 128/128/124
f 128/128/124 59/59/58 139/139/135
f 147/147/142 146/146/141 110/110/107
f 168/168/162 144/144/139 61/61/60
f 128/128/124 138/138/134 181/181/175
f 181/181/175 129/129/125 128/128/124
f 154/154/148 129/129/125 182/182/176
f 182/182/176 152/152/146 154/154/148
f 338/338/143 339/339/177 155/155/149
f 155/155/149 340/340/15 338/338/143
f 341/341/295 12/12/12 213/213/205
f 232/232/224 342/342/296 343/343/297
f 205/205/197 215/215/207 206/206/198
f 100/100/97 97/97/94 99/99/96
f 141/141/136 321/321/289 142/142/137
f 188/188/180 31/31/31 197/197/189
f 197/197/189 180/180/174 188/188/180
f 209/209/201 12/12/12 341/341/295
f 196/196/188 36/36/36 203/203/195
f 198/198/190 197/197/189 237/237/228
f 198/198/190 237/237/228 201/201/193
f 238/238/229 115/115/112 36/36/36
f 36/36/36 35/35/35 238/238/229
f 219/219/211 201/201/193 237/237/228
f 237/237/228 344/344/298 219/219/211
f 189/189/181 191/191/183 192/192/184
f 220/220/212 205/205/197 207/207/199
f 213/213/205 205/205/197 220/220/212
f 186/186/178 187/187/179 232/232/224
f 342/342/296 146/146/141 343/343/297
f 341/341/295 213/213/205 221/221/213
f 211/211/203 147/147/142 212/212/204
f 321/321/289 215/215/207 217/217/209
f 219/219/211 218/218/210 201/201/193
f 343/343/297 145/145/140 219/219/211
f 343/343/297 146/146/141 145/145/140
f 343/343/297 219/219/211 344/344/298
f 344/344/298 232/232/224 343/343/297
f 141/141/136 195/195/187 206/206/198
f 232/232/224 344/344/298 186/186/178
f 30/30/30 333/333/294 186/186/178
f 186/186/178 237/237/228 30/30/30
f 237/237/228 186/186/178 344/344/298
f 141/141/136 206/206/198 215/215/207
f 215/215/207 321/321/289 141/141/136
f 159/159/153 156/156/150 160/160/154
f 333/333/294 100/100/97 102/102/99
f 102/102/99 186/186/178 333/333/294
f 220/220/212 221/221/213 213/213/205
f 210/210/202 341/341/295 156/156/150
f 209/209/201 341/341/295 210/210/202
f 211/211/203 145/145/140 147/147/142
f 207/207/199 206/206/198 195/195/187
f 195/195/187 191/191/183 207/207/199
f 158/158/152 220/220/212 207/207/199
f 208/208/200 212/212/204 10/10/10
f 10/10/10 209/209/201 208/208/200
f 341/341/295 221/221/213 156/156/150
f 211/211/203 210/210/202 159/159/153
f 199/199/191 133/133/129 224/224/216
f 224/224/216 177/177/171 199/199/191
f 230/230/222 229/229/221 134/134/130
f 134/134/130 136/136/132 230/230/222
f 134/134/130 295/295/271 135/135/131
f 261/261/251 235/235/227 234/234/226
f 234/234/226 345/345/284 261/261/251
f 230/230/222 136/136/132 212/212/204
f 161/161/155 132/132/128 131/131/127
f 132/132/128 223/223/215 133/133/129
f 324/324/291 325/325/292 296/296/272
f 296/296/272 295/295/271 324/324/291
f 216/216/208 118/118/115 120/120/117
f 118/118/115 214/214/206 119/119/116
f 226/226/218 225/225/217 217/217/209
f 342/342/296 70/70/68 111/111/108
f 111/111/108 146/146/141 342/342/296
f 136/136/132 135/135/131 233/233/225
f 234/234/226 233/233/225 135/135/131
f 229/229/221 324/324/291 134/134/130
f 72/72/70 324/324/291 229/229/221
f 111/111/108 110/110/107 146/146/141
f 232/232/224 236/236/223 70/70/68
f 70/70/68 342/342/296 232/232/224
f 160/160/154 156/156/150 222/222/214
f 222/222/214 132/132/128 160/160/154
f 216/216/208 215/215/207 205/205/197
f 213/213/205 216/216/208 205/205/197
f 100/100/97 99/99/96 98/98/95
f 98/98/95 101/101/98 100/100/97
f 136/136/132 233/233/225 10/10/10
f 324/324/291 72/72/70 71/71/69
f 71/71/69 325/325/292 324/324/291
f 11/11/11 233/233/225 119/119/116
f 119/119/116 233/233/225 235/235/227
f 212/212/204 72/72/70 230/230/222
f 158/158/152 117/117/114 222/222/214
f 117/117/114 132/132/128 222/222/214
f 159/159/153 218/218/210 145/145/140
f 161/161/155 131/131/127 218/218/210
f 234/234/226 135/135/131 330/330/284
f 325/325/292 71/71/69 231/231/223
f 231/231/223 187/187/179 325/325/292
f 33/33/33 124/124/121 241/241/232
f 241/241/232 246/246/237 33/33/33
f 217/217/209 216/216/208 226/226/218
f 120/120/117 226/226/218 216/216/208
f 196/196/188 37/37/37 36/36/36
f 209/209/201 10/10/10 12/12/12
f 235/235/227 261/261/251 227/227/219
f 115/115/112 125/125/122 116/116/113
f 102/102/99 101/101/98 187/187/179
f 239/239/230 88/88/85 241/241/232
f 241/241/232 240/240/231 239/239/230
f 246/246/237 241/241/232 88/88/85
f 34/34/34 33/33/33 246/246/237
f 337/337/288 63/63/32 316/316/34
f 316/316/34 315/315/261 337/337/288
f 239/239/230 244/244/235 88/88/85
f 239/239/230 242/242/233 244/244/235
f 245/245/236 88/88/85 90/90/87
f 245/245/236 34/34/34 246/246/237
f 90/90/87 250/250/240 245/245/236
usemtl mat1
f 346/346/299 347/347/300 348/348/301
f 348/348/301 349/349/302 346/346/299
f 347/347/300 350/350/303 351/351/304
f 351/351/304 348/348/301 347/347/300
f 348/348/301 351/351/304 352/352/305
f 352/352/305 353/353/306 348/348/301
f 349/349/302 348/348/301 353/353/306
f 353/353/306 354/354/307 349/349/302
f 355/355/308 356/356/309 357/357/310
f 357/357/310 358/358/311 355/355/308
f 358/358/311 357/357/310 359/359/312
f 359/359/312 360/360/313 358/358/311
f 357/357/310 361/361/314 362/362/315
f 362/362/315 359/359/312 357/357/310
f 357/357/310 356/356/309 363/363/316
f 361/361/314 357/357/310 363/363/316
# Vertices: 363, normals: 316, texture coordinates: 363, faces: 608
` 
const chicken_mesh_unparsed = `# Created by Kenney (www.kenney.nl)

mtllib turkey.mtl

g turkey

v -0.2154832 0.141188 -0.2581953
v -0.2174851 0.1364381 -0.256321
v -0.2174851 0.1459379 -0.256321
v -0.2174851 0.1364381 0.256321
v -0.2154832 0.141188 0.2581953
v -0.2174851 0.1459379 0.256321
v 0.08542026 0.02454943 0.2064808
v -0.2021332 0.02454943 0.2064808
v 0.1253459 0.1158994 0.256321
v -0.2343771 0.09454031 0.2446675
v -0.2248685 0.1158994 0.256321
v -0.381105 0.1268945 0.1031329
v -0.381105 0.1389945 0.1281605
v -0.4092309 0.1101891 0.07680026
v -0.4388129 0.1047187 0.07413182
v -0.3893485 0.2084327 -0.2169776
v -0.3797456 0.2202994 -0.2009406
v -0.4176896 0.141188 -0.1904434
v -0.4130881 0.141188 -0.1697239
v -0.4130881 0.141188 0.1697239
v -0.3797456 0.2202994 0.2009406
v -0.4176896 0.141188 0.1904434
v -0.3893485 0.2084327 0.2169776
v -0.244217 0.2202994 -0.256321
v -0.3440694 0.2202994 -0.1628349
v -0.2798933 0.2202994 -0.2944267
v -0.2438244 0.0739433 0.2316611
v -0.3977586 0.0739433 0.0875411
v -0.244217 0.06207659 0.256321
v -0.4253161 0.06207658 0.0867681
v -0.2108745 0.141188 -0.2875377
v -0.2465508 0.141188 -0.3256434
v -0.2798933 0.06207659 -0.2944267
v -0.244217 0.06207659 -0.256321
v -0.3044739 0.0739433 -0.2964408
v -0.2761328 0.141188 -0.322975
v -0.244217 0.2202994 0.256321
v -0.2798933 0.2202994 0.2944267
v -0.3440694 0.2202994 0.1628349
v -0.3774119 0.141188 0.1316181
v -0.381105 0.1389945 -0.1281605
v -0.3774119 0.141188 -0.1316181
v -0.381105 0.2202994 -0.1281605
v -0.4388129 0.1047187 -0.07413182
v -0.4744892 0.1047187 -0.1122375
v -0.4584082 0.0739433 -0.1523208
v -0.4698805 0.1101891 -0.14158
v -0.3044739 0.2084327 -0.2964408
v -0.381105 0.2202994 0.1281605
v -0.2798933 0.06207659 0.2944267
v -0.4609924 0.06207659 0.1248738
v -0.3044739 0.0739433 0.2964408
v -0.4584082 0.0739433 0.1523208
v -0.2369389 0.09028035 0.2381075
v -0.3618379 0.09028035 0.1211717
v -0.381105 0.1158994 0.1031329
v -0.2465508 0.141188 0.3256435
v -0.2761328 0.141188 0.322975
v -0.3044739 0.2084327 0.2964408
v -0.2108745 0.141188 0.2875377
v -0.3124041 0.02454943 0.1032404
v -0.4609924 0.06207659 -0.1248738
v -0.4253161 0.06207659 -0.08676808
v -0.3618378 0.09028035 -0.1211717
v -0.381105 0.1158994 -0.1031329
v -0.3124041 0.02454943 -0.1032404
v -0.3977586 0.0739433 -0.08754108
v -0.4092309 0.1101891 -0.07680025
v -0.2438244 0.0739433 -0.2316611
v -0.2369389 0.09028035 -0.2381075
v -0.381105 0.1268945 -0.1031329
v 0.1506606 0.3116494 2.712427E-09
v 0.05405466 0.3116494 0.1673263
v 0.05405466 0.3116494 -0.1673263
v -0.1690722 0.3116494 -0.1673263
v -0.1690722 0.3116494 0.1673263
v -0.2584327 0.3116494 -0.08366317
v -0.2584327 0.3116494 0.08366317
v -0.2248685 0.1158994 -0.256321
v -0.2343771 0.09454031 -0.2446675
v 0.1253459 0.2202994 0.256321
v -0.4744892 0.1047187 0.1122375
v -0.4698805 0.1101891 0.14158
v 0.2733329 0.2202994 2.712429E-09
v 0.1253459 0.1158994 -0.256321
v 0.08542026 0.02454943 -0.2064808
v 0.2733329 0.1158994 2.712429E-09
v 0.204632 0.02454943 2.712426E-09
v 0.1253459 0.2202994 -0.256321
v -0.2021332 0.02454943 -0.2064808

vn 0.6834528 0 0.7299947
vn 0.6834528 0 -0.7299947
vn 0.3849985 -0.566 0.7289857
vn -0.2639004 -0.5528198 0.7904093
vn 0.426387 -0.5696927 0.7025983
vn -0.1525267 -0.5265695 0.8363374
vn 0 -0.4789478 0.8778434
vn -0.1262062 0.8931039 -0.4317841
vn -0.02652808 0.5504843 -0.8344239
vn 0.06137864 0.1494714 -0.9868592
vn -0.7073389 0.7004909 -0.09478509
vn -0.6695215 0.7296674 -0.1390193
vn -0.7479302 0.6426588 0.1661029
vn -0.6398597 0.7552394 0.1421022
vn -0.6398596 0.7552394 -0.1421022
vn -0.6695215 0.7296674 0.1390192
vn -0.7479302 0.6426587 -0.1661029
vn -0.7073389 0.7004909 0.09478504
vn 0.3649973 0.8660254 -0.3417265
vn -0.3649973 0.8660254 0.3417265
vn -0.3649973 0.8660254 0.3417265
vn 0.6629961 -0.6786515 -0.3160193
vn 0.3000536 -0.6514068 -0.6968766
vn 0.7783275 -0.5705137 -0.2621454
vn 0.2375956 -0.4974085 -0.8343459
vn 0.9878888 0 0.1551636
vn 0.9309278 0.3346553 0.146217
vn 0.7299947 0 -0.6834528
vn 0.3649973 -0.8660254 -0.3417265
vn -0.2103758 -0.5705138 -0.7938867
vn -0.08983988 0 -0.9959562
vn -0.27172 -0.6786515 -0.6823491
vn 0.3649973 0.8660254 0.3417265
vn -0.3649973 0.8660254 -0.3417265
vn -0.4858081 0.7464019 -0.4548348
vn -0.6834528 0 -0.7299947
vn -0.4858081 0.7464019 0.4548348
vn -0.2903916 0.9174723 0.2718772
vn -0.6789225 0.3674642 0.6356369
vn -0.6834529 0 0.7299946
vn -0.2103758 -0.5705137 0.7938867
vn -0.8169086 -0.4974085 0.2919679
vn -0.27172 -0.6786515 0.6823491
vn -0.6756283 -0.6514067 0.3452473
vn -0.08983988 0 0.9959562
vn -0.2103758 0.5705138 0.7938867
vn -0.27172 0.6786515 0.6823491
vn 0.3649973 -0.8660254 0.3417265
vn -0.400567 -0.8360022 -0.3750283
vn 0.9309278 -0.3346553 -0.146217
vn 0.9878888 0 -0.1551636
vn -0.5564498 -0.5806205 0.5943429
vn -0.7131853 -0.6236611 0.3200215
vn -0.7509063 -0.6238437 0.2166996
vn -0.400567 -0.8360022 0.3750284
vn -0.7509063 -0.6238437 -0.2166996
vn -0.7992081 -0.6010544 0
vn -0.7131853 -0.6236611 -0.3200215
vn 0.2375956 -0.4974084 0.8343459
vn 0.06137864 0.1494715 0.9868592
vn 0.3000536 -0.6514067 0.6968767
vn -0.02652808 0.5504844 0.8344239
vn -0.6756283 -0.6514066 -0.3452472
vn -0.8343616 0.5504844 -0.02842143
vn -0.8169086 -0.4974085 -0.2919679
vn -0.9806837 0.1494715 -0.1261656
vn 0 1 0
vn 0.7299947 0 0.6834528
vn 0.7783275 -0.5705137 0.2621454
vn 0.9309278 -0.3346553 0.146217
vn 0.6629961 -0.6786515 0.3160194
vn 0 0 1
vn 0.5 0 0.8660254
vn -0.2103758 0.5705138 -0.7938867
vn -0.27172 0.6786515 -0.6823491
vn -0.9806837 0.1494715 0.1261656
vn -0.8343616 0.5504844 0.02842141
vn -0.1262062 0.8931039 0.4317839
vn 0.5972588 0.8020486 0
vn 0.3290377 0.778082 0.5350913
vn 0.2836978 0.7735201 0.5667295
vn -0.5229803 0.818364 -0.2382687
vn -0.5229803 0.818364 0.2382687
vn -0.5288144 0.8188615 -0.2232067
vn -0.5288144 0.8188615 0.2232067
vn 0.426387 -0.5696927 -0.7025983
vn 0.3849985 -0.566 -0.7289857
vn 0.7992081 -0.6010544 0
vn 0.5 0 -0.8660254
vn 1 0 0
vn -0.1891502 0.7606173 0.6210343
vn -0.259639 0.7749507 0.5762281
vn -0.4221174 0.786473 0.4508627
vn 0 -1 0
vn 0.3290377 0.778082 -0.5350913
vn 0.2836978 0.7735201 -0.5667295
vn 0 0 -1
vn -0.2903916 0.9174723 -0.2718773
vn -0.6789225 0.3674641 -0.6356369
vn -0.6834528 0 0.7299947
vn -0.2639004 -0.5528198 -0.7904093
vn -0.1525267 -0.5265695 -0.8363374
vn 0 -0.4789478 -0.8778434
vn 0.9309278 0.3346553 -0.146217
vn -0.259639 0.7749507 -0.5762281
vn -0.1891502 0.7606173 -0.6210343
vn -1 0 0
vn -0.4221174 0.786473 -0.4508627
vn -0.5564498 -0.5806205 -0.5943429

vt 0.7544369 5.558583
vt 0.6464704 5.37158
vt 0.6464704 5.745586
vt -0.6464705 5.371579
vt -0.754437 5.558583
vt -0.6464705 5.745586
vt 3.363002 4.741893
vt -7.958001 4.741893
vt 4.934879 8.838817
vt -9.227447 7.880889
vt -8.85309 8.838817
vt 15.54069 1.968605
vt 15.81713 3.027569
vt 16.31268 0.5065768
vt 17.40108 0.02781816
vt -11.66253 1.512937
vt -10.9642 2.034647
vt -10.88462 -1.443419
vt -10.04902 -1.443419
vt 10.04902 -1.443419
vt 10.9642 2.034648
vt 10.88463 -1.443419
vt 11.66253 1.512938
vt 9.614844 -10.09138
vt 13.54604 -6.410821
vt 11.01942 -11.5916
vt 14.95062 -7.911046
vt 0.7740568 -9.499812
vt 9.076041 -9.499812
vt 0.1218028 -10.35751
vt 9.888843 -10.35751
vt 9.895087 8.570612
vt 8.725711 8.570612
vt 8.477285 11.87581
vt 8.640585 8.769057
vt 15.99306 5.652087
vt 15.99306 2.05563
vt 13.93794 5.652087
vt 13.93794 2.05563
vt 9.933472 6.49785
vt 8.51567 9.803049
vt 10.89018 6.99363
vt 9.685046 9.803049
vt 9.614844 10.09138
vt 11.01942 11.5916
vt 13.54604 6.410821
vt 14.95062 7.911047
vt 13.93794 1.161239
vt 13.93794 4.757696
vt 15.99306 1.161239
vt 15.99306 4.757696
vt 7.504447 5.472224
vt 7.305271 5.558583
vt 7.504447 8.673206
vt 5.507042 8.673206
vt -13.93794 -4.491182
vt -13.93794 -4.708275
vt -15.99306 -4.491182
vt -13.93794 -8.100534
vt -15.99306 -8.100534
vt 16.12618 0.9953283
vt 15.04714 1.476972
vt 16.72015 2.726079
vt 15.55202 2.948111
vt 0.7740573 2.911154
vt -0.7544369 5.558583
vt 9.076041 2.911154
vt 9.694763 4.338154
vt 6.880005 5.558583
vt 0.7740572 8.206013
vt 5.351511 8.206013
vt -7.504447 5.472224
vt -7.504447 8.673206
vt -7.30527 5.558583
vt -5.507042 8.673205
vt -0.1218033 14.74346
vt -9.888844 14.74346
vt -0.7740573 15.60116
vt -9.076041 15.60116
vt 0.4027105 3.554344
vt 7.138763 3.554344
vt 0.774057 2.911153
vt 9.076041 2.911153
vt 9.694763 4.338154
vt 8.177878 4.562969
vt 8.177878 4.995848
vt -8.51567 0.6731084
vt -9.685046 0.6731084
vt -9.933472 3.978307
vt -10.89018 3.482527
vt -9.614844 10.09138
vt -16.74473 3.416067
vt -11.01942 11.5916
vt -18.14931 4.916292
vt -8.640586 1.707099
vt -8.595482 0.849013
vt -8.725711 1.905545
vt -8.477285 -1.399653
vt -9.895088 1.905545
vt -8.084155 -0.04335056
vt -7.813365 -0.2213272
vt -7.520579 -0.9038734
vt -0.1525718 10.77487
vt -0.2533965 7.390404
vt -0.4027105 10.56888
vt -6.200526 7.390404
vt -7.138763 10.56888
vt -9.933472 6.49785
vt -10.89018 6.99363
vt -8.51567 9.803048
vt -9.685046 9.803048
vt -15.99306 6.176044
vt -15.99306 8.005879
vt -13.93794 6.176044
vt -13.93794 8.005879
vt -4.770538 11.40303
vt -4.060351 12.66506
vt -4.064583 8.165038
vt 4.064583 8.165038
vt 4.060351 12.66506
vt 4.770538 11.40303
vt -16.12618 0.9953288
vt -16.72015 2.72608
vt -15.04714 1.476973
vt -15.55202 2.948111
vt -0.1218028 -8.687892
vt -0.7740568 -9.545592
vt -5.507042 -8.687892
vt -5.35151 -9.545592
vt -2.254648 7.41472
vt -1.749773 8.885859
vt -1.175613 6.933076
vt -0.5816422 8.663827
vt -0.7740573 2.911154
vt -9.076041 2.911154
vt -0.4027109 3.554344
vt -7.138763 3.554344
vt -9.694763 4.338154
vt -8.177879 4.56297
vt -8.177879 4.995848
vt -5.931519 1.067885E-07
vt -2.128136 6.587652
vt -2.128136 -6.587652
vt 6.656385 -6.587652
vt 6.656385 6.587652
vt 10.17451 -3.293826
vt 10.17451 3.293826
vt -13.93794 2.05563
vt -15.99306 2.05563
vt -13.93794 5.652087
vt -15.99306 5.652087
vt -15.99306 4.757695
vt -13.93794 4.757695
vt -15.99306 1.161239
vt -13.93794 1.161239
vt 9.895087 1.905545
vt 8.477285 -1.399653
vt 8.725711 1.905545
vt 8.595482 0.8490131
vt 8.640585 1.7071
vt 8.084154 -0.0433505
vt 7.520578 -0.9038733
vt 7.813365 -0.2213273
vt -8.85309 4.56297
vt -8.562407 5.371579
vt 4.934879 4.56297
vt 4.934879 8.673206
vt -8.562407 5.745586
vt -9.614843 8.673206
vt 0.1218035 -8.687891
vt 5.507043 -8.687891
vt 0.7740575 -9.545591
vt 5.351511 -9.545591
vt -0.7740575 -9.499811
vt -0.1218035 -10.35751
vt -9.076041 -9.499811
vt -9.888844 -10.35751
vt 0.1218031 14.74346
vt 0.774057 15.60116
vt 9.888844 14.74346
vt 9.076041 15.60116
vt 0.5816424 8.663827
vt 1.749773 8.885859
vt 1.175614 6.933076
vt 2.254648 7.41472
vt -15.81713 3.027568
vt -15.54069 1.968603
vt -17.40108 0.027817
vt -16.31268 0.5065757
vt -13.93794 7.572118
vt -13.93794 3.975662
vt -15.99306 7.572118
vt -15.99306 3.975662
vt 5.380569 -1.411543
vt -6.271951 -1.411543
vt 2.965759 4.104653
vt -4.641006 4.104653
vt -3.293826 -0.8322908
vt 3.293826 -0.8322908
vt -5.045689 -6.853896
vt 5.045689 -6.853896
vt 6.27195 8.909649
vt 5.358563 4.617645
vt -5.380569 8.909649
vt -4.028189 4.617645
vt 6.27195 8.673206
vt 6.27195 4.56297
vt -5.380569 8.673206
vt -5.380569 4.56297
vt 8.51567 0.6731089
vt 9.933472 3.978307
vt 9.685046 0.6731089
vt 10.89018 3.482528
vt -0.3567764 0.2180146
vt -0.1218031 -5.605031
vt -5.176166 0.2180146
vt -5.507042 -5.605031
vt -7.504447 -5.605031
vt 8.056378 1.067884E-07
vt 3.363002 -8.129166
vt 3.363002 8.129166
vt -7.958001 8.129166
vt -7.958001 -8.129166
vt -12.29937 -4.064583
vt -12.29937 4.064583
vt 4.028189 4.617645
vt -5.358563 4.617645
vt 5.380569 8.909649
vt -6.271951 8.909649
vt -5.380569 -1.411543
vt -2.96576 4.104654
vt 6.27195 -1.411543
vt 4.641006 4.104654
vt -10.04902 -10.38502
vt -8.363698 -13.57674
vt -10.88462 -10.38502
vt -9.452099 -13.09798
vt 8.85309 4.56297
vt -4.934879 4.56297
vt 8.562407 5.37158
vt -4.934879 8.673206
vt 8.562407 5.745586
vt 9.614843 8.673206
vt 4.934879 -0.8294376
vt -9.614843 -0.8294376
vt 2.128136 4.191578
vt -6.656385 4.191578
vt -9.614843 -10.09138
vt -11.01942 -11.5916
vt -16.74473 -3.416066
vt -18.14931 -4.916292
vt 13.93795 -4.491181
vt 15.99306 -4.491181
vt 13.93795 -4.708273
vt 13.93795 -8.100533
vt 15.99306 -8.100533
vt 5.380569 8.673206
vt 5.380569 4.56297
vt -6.271951 8.673206
vt -6.271951 4.56297
vt -9.076041 2.911153
vt -9.694763 4.338154
vt -0.774057 2.911153
vt 0.754437 5.558583
vt -6.880004 5.558583
vt -5.351511 8.206012
vt -0.7740571 8.206012
vt 7.958001 4.741893
vt -3.363002 4.741893
vt 9.227447 7.880888
vt -4.934879 8.838817
vt 8.85309 8.838817
vt 13.93794 8.005879
vt 15.99306 8.005879
vt 13.93794 6.176044
vt 15.99306 6.176044
vt 15.99306 3.975662
vt 13.93794 3.975662
vt 15.99306 7.572118
vt 13.93794 7.572118
vt 10.04902 -10.38502
vt 10.88463 -10.38502
vt 8.3637 -13.57674
vt 9.452101 -13.09798
vt -8.477285 11.87581
vt -8.640585 8.769057
vt -9.895088 8.570612
vt -8.725711 8.570612
vt 9.614843 -0.8294375
vt -4.934879 -0.8294375
vt 6.656385 4.191578
vt -2.128136 4.191578
vt -4.060351 4.56297
vt 4.060351 4.995848
vt 4.060351 4.56297
vt 5.045689 8.673206
vt 5.045689 5.472224
vt -4.060351 4.995848
vt -5.045689 5.472224
vt -5.045689 8.673206
vt 0.3567765 0.2180147
vt 5.176167 0.2180147
vt 0.1218032 -5.605031
vt 5.507042 -5.605031
vt 7.504447 -5.605031
vt 6.200526 7.390404
vt 0.2533967 7.390404
vt 7.138763 10.56888
vt 0.4027109 10.56888
vt 0.1525719 10.77487

usemtl brownDark

f 3/3/1 2/2/1 1/1/1
f 6/6/2 5/5/2 4/4/2
f 9/9/5 8/8/4 7/7/3
f 8/8/4 9/9/5 10/10/6
f 10/10/6 9/9/5 11/11/7
f 14/14/9 13/13/8 12/12/8
f 13/13/8 14/14/9 15/15/10
f 18/18/13 17/17/12 16/16/11
f 17/17/12 18/18/13 19/19/14
f 22/22/17 21/21/16 20/20/15
f 21/21/16 22/22/17 23/23/18
f 26/26/19 25/25/20 24/24/19
f 25/25/20 26/26/19 17/27/21
f 29/30/24 28/29/23 27/28/22
f 28/29/23 29/30/24 30/31/25
f 24/34/27 1/33/26 31/32/26
f 1/33/26 24/34/27 3/35/27
f 31/38/28 33/37/29 32/36/28
f 33/37/29 31/38/28 34/39/29
f 35/42/32 32/41/31 33/40/30
f 32/41/31 35/42/32 36/43/31
f 39/46/34 38/45/33 37/44/33
f 38/45/33 39/46/34 21/47/34
f 20/50/35 39/49/34 40/48/35
f 39/49/34 20/50/35 21/51/34
f 43/54/36 42/53/36 41/52/36
f 42/53/36 43/54/36 25/55/36
f 19/58/37 41/57/38 42/56/37
f 41/57/38 19/58/37 44/59/39
f 44/59/39 19/58/37 45/60/39
f 15/63/10 28/62/23 30/61/25
f 28/62/23 15/63/10 14/64/9
f 46/67/36 36/66/36 35/65/36
f 36/66/36 46/67/36 47/68/36
f 36/66/36 47/68/36 18/69/36
f 36/66/36 18/69/36 48/70/36
f 48/70/36 18/69/36 16/71/36
f 40/74/40 49/73/40 13/72/40
f 49/73/40 40/74/40 39/75/40
f 52/78/43 51/77/42 50/76/41
f 51/77/42 52/78/43 53/79/44
f 27/82/2 55/81/2 54/80/2
f 28/83/2 55/81/2 27/82/2
f 55/81/2 28/83/2 14/84/2
f 55/81/2 14/84/2 56/85/2
f 56/85/2 14/84/2 12/86/2
f 38/89/46 58/88/45 57/87/45
f 58/88/45 38/89/46 59/90/47
f 50/93/48 30/92/49 29/91/48
f 30/92/49 50/93/48 51/94/49
f 5/97/51 11/96/50 4/95/50
f 11/96/50 5/97/51 29/98/24
f 29/98/24 5/97/51 60/99/51
f 29/98/24 10/100/50 11/96/50
f 29/98/24 54/101/50 10/100/50
f 54/101/50 29/98/24 27/102/22
f 54/105/52 8/104/4 10/103/6
f 8/104/4 54/105/52 61/106/53
f 55/107/54 61/106/53 54/105/52
f 57/110/45 52/109/43 50/108/41
f 52/109/43 57/110/45 58/111/45
f 63/114/55 45/113/39 62/112/55
f 45/113/39 63/114/55 44/115/39
f 66/118/58 65/117/57 64/116/56
f 65/117/57 66/118/58 61/119/53
f 65/117/57 61/119/53 56/120/57
f 56/120/57 61/119/53 55/121/54
f 67/124/61 44/123/60 63/122/59
f 44/123/60 67/124/61 68/125/62
f 21/128/16 59/127/47 38/126/46
f 59/127/47 21/128/16 23/129/18
f 62/132/65 47/131/64 46/130/63
f 47/131/64 62/132/65 45/133/66
f 70/136/1 67/135/1 69/134/1
f 67/135/1 70/136/1 64/137/1
f 67/135/1 64/137/1 68/138/1
f 68/138/1 64/137/1 65/139/1
f 68/138/1 65/139/1 71/140/1
f 74/143/67 73/142/67 72/141/67
f 73/142/67 74/143/67 75/144/67
f 73/142/67 75/144/67 76/145/67
f 76/145/67 75/144/67 77/146/67
f 76/145/67 77/146/67 78/147/67
f 60/150/68 50/149/48 29/148/48
f 50/149/48 60/150/68 57/151/68
f 19/154/37 25/153/20 17/152/21
f 25/153/20 19/154/37 42/155/37
f 1/158/26 34/157/69 31/156/26
f 34/157/69 1/158/26 79/159/70
f 79/159/70 1/158/26 2/160/70
f 34/157/69 79/159/70 80/161/70
f 34/157/69 80/161/70 69/162/71
f 69/162/71 80/161/70 70/163/70
f 9/166/73 4/165/72 11/164/72
f 4/165/72 9/166/73 81/167/73
f 4/165/72 81/167/73 6/168/72
f 6/168/72 81/167/73 37/169/72
f 48/172/75 17/171/12 26/170/74
f 17/171/12 48/172/75 16/173/11
f 67/176/61 34/175/69 69/174/71
f 34/175/69 67/176/61 63/177/59
f 62/180/65 35/179/32 33/178/30
f 35/179/32 62/180/65 46/181/63
f 51/184/42 83/183/77 82/182/76
f 83/183/77 51/184/42 53/185/44
f 44/188/60 71/187/78 41/186/78
f 71/187/78 44/188/60 68/189/62
f 38/192/33 60/191/68 37/190/33
f 60/191/68 38/192/33 57/193/68
f 72/196/79 81/195/80 84/194/79
f 81/195/80 72/196/79 73/197/81
f 43/200/84 78/199/83 77/198/82
f 78/199/83 43/200/84 49/201/85
f 87/204/88 86/203/87 85/202/86
f 86/203/87 87/204/88 88/205/88
f 84/208/90 85/207/89 89/206/89
f 85/207/89 84/208/90 87/209/90
f 36/212/31 26/211/74 32/210/31
f 26/211/74 36/212/31 48/213/75
f 78/216/83 37/215/92 76/214/91
f 37/215/92 78/216/83 39/217/93
f 39/217/93 78/216/83 49/218/85
f 7/221/94 86/220/94 88/219/94
f 86/220/94 7/221/94 8/222/94
f 86/220/94 8/222/94 90/223/94
f 90/223/94 8/222/94 66/224/94
f 66/224/94 8/222/94 61/225/94
f 87/228/88 7/227/3 88/226/88
f 7/227/3 87/228/88 9/229/5
f 89/232/95 72/231/79 84/230/79
f 72/231/79 89/232/95 74/233/96
f 18/236/13 45/235/66 19/234/14
f 45/235/66 18/236/13 47/237/64
f 2/240/97 85/239/89 79/238/97
f 85/239/89 2/240/97 89/241/89
f 89/241/89 2/240/97 3/242/97
f 89/241/89 3/242/97 24/243/97
f 73/246/81 37/245/92 81/244/80
f 37/245/92 73/246/81 76/247/91
f 63/250/55 33/249/29 34/248/29
f 33/249/29 63/250/55 62/251/55
f 13/254/98 20/253/35 40/252/35
f 20/253/35 13/254/98 15/255/99
f 20/253/35 15/255/99 82/256/99
f 81/259/73 87/258/90 84/257/90
f 87/258/90 81/259/73 9/260/73
f 52/263/100 83/262/100 53/261/100
f 83/262/100 52/263/100 58/264/100
f 83/262/100 58/264/100 22/265/100
f 22/265/100 58/264/100 23/266/100
f 23/266/100 58/264/100 59/267/100
f 80/270/102 86/269/87 90/268/101
f 86/269/87 80/270/102 85/271/86
f 85/271/86 80/270/102 79/272/103
f 30/275/49 82/274/99 15/273/99
f 82/274/99 30/275/49 51/276/49
f 26/279/19 31/278/28 32/277/28
f 31/278/28 26/279/19 24/280/19
f 82/283/76 22/282/17 20/281/15
f 22/282/17 82/283/76 83/284/77
f 60/287/51 6/286/104 37/285/104
f 6/286/104 60/287/51 5/288/51
f 75/291/106 89/290/95 24/289/105
f 89/290/95 75/291/106 74/292/96
f 56/295/107 12/294/107 65/293/107
f 49/296/107 65/293/107 12/294/107
f 49/296/107 12/294/107 13/297/107
f 49/296/107 71/298/107 65/293/107
f 49/296/107 41/299/107 71/298/107
f 41/299/107 49/296/107 43/300/107
f 24/303/105 77/302/82 75/301/106
f 77/302/82 24/303/105 25/304/108
f 77/302/82 25/304/108 43/305/84
f 64/308/56 90/307/101 66/306/58
f 90/307/101 64/308/56 70/309/109
f 80/310/102 90/307/101 70/309/109

g leg

v -0.02018873 -4.22995E-18 0.2804412
v -0.1534428 0.1379548 0.3161466
v 0.0003234446 0.04343766 0.3120238
v -0.1022155 0.1495938 0.3394991
v 0.1385343 0.05049495 0.1446901
v 0.1629215 0.1447198 0.1381555
v 0.09854957 0.08229352 0.1183251
v 0.1360815 0.2273056 0.1082685
v 0.1873087 0.2389446 0.131621
v -0.06468366 0.2946059 0.3294424
v -0.1046684 0.3264045 0.3030775
v 0.07538723 0.3334618 0.2919106
v 0.07736001 0.3768994 0.2543031
v 0.1206817 0.307922 0.1494737
v 0.143987 0.307922 0.2364505
v 0.05405466 0.3768994 0.1673263
v -0.04349409 1.341783E-09 0.1934644
v -0.1767482 0.1379548 0.2291698
v 0.1862269 0.1447198 0.2251323
v 0.2106141 0.2389446 0.2185978
v 0.2509578 0.1845412 0.2077877
v 0.219278 0.3069429 0.2162763
v -0.04152133 0.04343766 0.155857
v -0.1440603 0.1495938 0.1833323
v 0.1403943 0.08229352 0.274492
v 0.1779262 0.2273055 0.2644353
v 0.03354246 0.3334618 0.1357438
v 0.1618397 0.05049495 0.2316669
v -0.1279738 0.3264045 0.2161007
v 0.2276525 0.1845412 0.1208109
v 0.1959726 0.3069429 0.1292996
v -0.1065284 0.2946059 0.1732756
v 0.223166 0.2129751 0.1335043
v 0.2407258 0.2129751 0.1990382
v 0.2062046 0.278509 0.1380491
v 0.2237644 0.278509 0.203583
v 0.4388398 0.2296975 0.1378492
v 0.3907667 0.2632632 0.1507304
v 0.4603205 0.2626714 0.1320934
v 0.4122474 0.296237 0.1449746
v 0.3777194 0.3136739 0.1542263
v 0.4376689 0.3501902 0.1381629
v 0.403141 0.3676271 0.1474147
v 0.3642119 0.3136739 0.1038157
v 0.3772592 0.2632632 0.1003197
v 0.4253323 0.2296976 0.08743853
v 0.446813 0.2626714 0.08168278
v 0.3987399 0.296237 0.09456394
v 0.4241615 0.3501902 0.08775225
v 0.3896335 0.3676271 0.097004

vn 0.06095432 -0.7853001 1.040487
vn -0.4943367 -0.2104205 1.189277
vn 0.2910861 -0.5748795 -1.134816
vn 0.5755832 -0.228633 -1.148676
vn 0.4943367 0.2104205 -1.189277
vn -0.2910861 0.5748795 1.134816
vn 0.4674555 0.7853001 0.9315653
vn 0.4896897 1.202502 -0.131212
vn 0.32625 1.260533 -0.08741842
vn -0.32625 -1.260533 0.08741842
vn -1.217582 -0.3377588 0.32625
vn 0.3377588 0 1.260533
vn -0.4674555 -0.7853001 -0.9315653
vn -1.022747 -0.2104205 -0.7827755
vn -0.06095432 0.7853001 -1.040487
vn 0.3547407 0.6246369 -1.089501
vn 0.8194959 -0.5748795 0.8372364
vn 1.072808 -0.228633 0.7069907
vn 1.022747 0.2104205 0.7827755
vn -0.8913316 0.9227743 0.2388316
vn 0.8913316 -0.9227743 -0.2388316
vn -0.3377588 0 -1.260533
vn 1.167588 -0.4918199 -0.3128541
vn 1.004848 -0.7879156 -0.2692482
vn -0.8194959 0.5748795 -0.8372364
vn 0.8519651 0.6246369 0.7661653
vn 0.7736297 1.030316 -0.2072935
vn 1.217582 0.3377588 -0.32625
vn 0.360781 0.006403193 1.254122
vn -0.2682099 1.275117 0.07186662
vn -0.2797058 0.01599883 -1.274572
vn -0.3146153 0.006403232 -1.266492
vn 0.3835577 -1.243119 -0.102774
vn -1.13293 0.5721375 0.3035676
vn 0.3950535 0.0159988 1.243664
vn 1.045067 -0.7296885 -0.2800249
vn 0.7048249 1.081933 -0.1888573
vn 1.13293 -0.5721375 -0.3035676
vn 0.5526424 1.172895 -0.1480801
vn -0.7048249 -1.081933 0.1888573

vt -3.869872 1.980028
vt -7.358948 6.720208
vt -2.986462 3.472564
vt -5.671307 7.120132
vt 0.7630825 1.69934
vt 0.1936281 4.586632
vt 2.197878 2.67373
vt 1.321487 7.117274
vt -0.3758263 7.473926
vt -6.418823 4.086717
vt -7.602262 5.354607
vt -2.162902 5.635999
vt -2.0715 7.367969
vt 1.358268 6.831572
vt -1.358268 6.831572
vt 1.358268 9.774485
vt -1.358268 9.774485
vt -1.358268 3.888658
vt -1.358268 9.774485
vt 1.358268 3.888658
vt 1.358268 9.774485
vt 0.9475608 4.366
vt 1.709243 7.208636
vt 2.969295 5.567358
vt 1.979841 9.260051
vt -0.3717111 9.28959
vt 3.869872 1.980028
vt 2.986462 3.472564
vt 7.358948 6.720208
vt 5.671307 7.120132
vt -5.148258 1.310455
vt -8.350846 4.513043
vt -0.773441 2.482684
vt 0.3987877 6.857501
vt -7.178617 8.88786
vt -2.803801 10.06009
vt 0.9951879 4.938269
vt -0.6924538 5.338192
vt 3.680032 8.585837
vt 1.052084 7.708282
vt 2.796622 10.07837
vt -0.7630824 1.699339
vt -2.197877 2.67373
vt -0.1936281 4.586632
vt -1.321487 7.117274
vt 0.3758262 7.473926
vt -1.358268 1.519566
vt -1.358268 7.405393
vt 1.358268 1.519566
vt 1.358268 7.405393
vt -1.358268 0.5738207
vt 1.358268 0.5738209
vt -1.358267 -5.312006
vt 1.358268 -5.312006
vt -0.9475608 4.366
vt -2.969295 5.567358
vt -1.709243 7.208636
vt -1.979841 9.260051
vt 0.3717111 9.28959
vt -1.358268 5.396655
vt 1.358268 5.396655
vt -1.358268 3.044917
vt 1.358268 3.044917
vt -5.664443 0.03136122
vt -5.573042 1.763331
vt -0.1336809 2.044723
vt -1.31712 3.312613
vt 6.321003 2.795516
vt 4.62369 3.152167
vt 5.182095 8.570102
vt 3.747299 7.595711
vt -1.358268 0.5738209
vt 1.358268 0.5738207
vt -1.358268 -5.312006
vt 1.358267 -5.312006
vt 6.418823 4.086717
vt 2.162902 5.635998
vt 7.602262 5.354606
vt 2.0715 7.367968
vt 5.148258 1.310455
vt 0.773441 2.482684
vt 8.350846 4.513043
vt -0.3987877 6.857501
vt 7.178617 8.88786
vt 2.803801 10.06009
vt 5.664443 0.03136138
vt 0.133681 2.044723
vt 5.573042 1.763331
vt 1.31712 3.312613
vt -0.9951879 4.938269
vt -3.680032 8.585837
vt 0.6924538 5.338192
vt -1.052084 7.708282
vt -2.796622 10.07837
vt -6.321003 2.795516
vt -5.182094 8.570102
vt -4.62369 3.152167
vt -3.747299 7.595711
vt 1.358268 1.519566
vt -1.358268 1.519566
vt 1.358268 4.462479
vt -1.358268 4.462479
vt -1.358265 -1.863374
vt -1.358268 0.488364
vt 1.35827 -1.86337
vt 1.358267 0.4883673
vt -1.358268 4.609145
vt 1.023406 5.497218
vt 1.358268 4.609145
vt 1.358268 8.432101
vt -1.023406 5.497218
vt 1.023406 7.544029
vt -1.023406 7.544029
vt -1.358268 8.432101
vt 8.990396 6.929664
vt 7.488934 7.942294
vt 9.661302 7.924438
vt 8.15984 8.937069
vt 7.081431 9.463116
vt 8.953828 10.56476
vt 7.87542 11.09081
vt -0.7872345 8.93279
vt 0.7872356 8.93279
vt -1.023405 3.946878
vt 1.023406 3.946878
vt -2.689748 6.410617
vt -7.445069 7.927855
vt -2.160549 8.387834
vt -7.037993 9.448791
vt -0.7872354 9.550522
vt 0.7872347 9.550522
vt -1.023406 4.56461
vt 1.023405 4.56461
vt -8.990396 6.929664
vt -9.661302 7.924438
vt -7.488934 7.942294
vt -8.15984 8.937069
vt -7.081431 9.463116
vt -8.953828 10.56476
vt -7.87542 11.09081
vt -0.787235 11.60981
vt -0.7872349 13.42083
vt 0.7872352 11.60981
vt 0.7872352 13.42083
vt 2.689748 6.410617
vt 2.160549 8.387834
vt 7.445069 7.927855
vt 7.037993 9.448791
vt 0.787235 10.77212
vt -0.7872352 10.77212
vt 0.787235 11.972
vt -0.7872352 11.972
vt 0.7872353 -3.578937
vt -0.7872349 -3.578937
vt 0.7872352 -1.767914
vt -0.787235 -1.767914
vt 0.787235 11.60981
vt -0.7872352 11.60981
vt 0.7872349 13.42083
vt -0.7872352 13.42083
vt -0.7872348 -3.415637
vt -0.7872349 -2.215766
vt 0.7872353 -3.415637
vt 0.7872352 -2.215766
vt -0.7872353 -3.578937
vt -0.7872352 -1.767914
vt 0.7872349 -3.578937
vt 0.787235 -1.767914

usemtl brownDark

f 93/313/110 92/312/111 91/311/110
f 92/312/111 93/313/110 94/314/111
f 97/317/112 96/316/113 95/315/112
f 96/316/113 97/317/112 98/318/114
f 96/316/113 98/318/114 99/319/114
f 102/322/116 101/321/115 100/320/115
f 101/321/115 102/322/116 103/323/116
f 106/326/118 105/325/117 104/324/117
f 105/325/117 106/326/118 103/327/118
f 91/330/119 108/329/120 107/328/119
f 108/329/120 91/330/119 92/331/120
f 111/334/121 110/333/121 109/332/121
f 110/333/121 111/334/121 112/335/121
f 110/333/121 112/335/121 105/336/121
f 108/339/123 113/338/122 107/337/122
f 113/338/122 108/339/123 114/340/123
f 115/343/121 94/342/121 93/341/121
f 94/342/121 115/343/121 116/344/121
f 94/342/121 116/344/121 100/345/121
f 100/345/121 116/344/121 102/346/121
f 117/349/124 99/348/114 98/347/114
f 99/348/114 117/349/124 104/350/125
f 104/350/125 117/349/124 106/351/124
f 109/354/127 115/353/126 118/352/126
f 115/353/126 109/354/127 116/355/128
f 116/355/128 109/354/127 110/356/128
f 92/359/120 119/358/129 108/357/120
f 119/358/129 92/359/120 101/360/129
f 91/363/119 95/362/130 118/361/130
f 95/362/130 91/363/119 107/364/119
f 99/367/131 120/366/131 96/365/131
f 120/366/131 99/367/131 121/368/131
f 121/368/131 99/367/131 104/369/131
f 109/372/133 120/371/132 111/370/132
f 120/371/132 109/372/133 96/373/133
f 118/376/126 93/375/110 91/374/110
f 93/375/110 118/376/126 115/377/126
f 119/380/134 114/379/123 108/378/123
f 114/379/123 119/380/134 122/381/134
f 119/384/129 103/383/118 106/382/118
f 103/383/118 119/384/129 101/385/129
f 119/388/134 117/387/124 122/386/134
f 117/387/124 119/388/134 106/389/124
f 114/392/131 97/391/131 113/390/131
f 97/391/131 114/392/131 98/393/131
f 98/393/131 114/392/131 122/394/131
f 98/393/131 122/394/131 117/395/131
f 113/398/122 95/397/112 107/396/122
f 95/397/112 113/398/122 97/399/112
f 110/402/128 102/401/116 116/400/128
f 102/401/116 110/402/128 105/403/135
f 102/401/116 105/403/135 103/404/116
f 94/407/111 101/406/115 92/405/111
f 101/406/115 94/407/111 100/408/115
f 96/411/133 118/410/130 95/409/130
f 118/410/130 96/411/133 109/412/133
f 121/415/136 105/414/117 112/413/136
f 105/414/117 121/415/136 104/416/117
f 120/419/132 123/418/137 111/417/132
f 123/418/137 120/419/132 121/420/136
f 111/417/132 123/418/137 124/421/137
f 121/420/136 125/422/137 123/418/137
f 111/417/132 124/421/137 126/423/137
f 125/422/137 121/420/136 112/424/136
f 125/422/137 112/424/136 126/423/137
f 126/423/137 112/424/136 111/417/132

usemtl brownLight

f 129/427/121 128/426/138 127/425/121
f 128/426/138 129/427/121 130/428/121
f 128/426/138 130/428/121 131/429/138
f 131/429/138 130/428/121 132/430/121
f 131/429/138 132/430/121 133/431/121
f 125/434/139 131/433/139 134/432/139
f 131/433/139 125/434/139 126/435/139
f 125/438/140 135/437/141 123/436/140
f 135/437/141 125/438/140 134/439/141
f 124/442/142 135/441/142 128/440/142
f 135/441/142 124/442/142 123/443/142
f 135/446/141 137/445/131 136/444/131
f 137/445/131 135/446/141 138/447/131
f 138/447/131 135/446/141 134/448/141
f 138/447/131 134/448/141 139/449/131
f 139/449/131 134/448/141 140/450/131
f 131/453/143 140/452/143 134/451/143
f 140/452/143 131/453/143 133/454/143
f 128/457/138 126/456/144 124/455/144
f 126/456/144 128/457/138 131/458/138
f 137/461/145 127/460/145 136/459/145
f 127/460/145 137/461/145 129/462/145
f 138/465/137 129/464/146 137/463/146
f 129/464/146 138/465/137 130/466/137
f 139/469/147 130/468/137 138/467/137
f 130/468/137 139/469/147 132/470/147
f 139/473/148 133/472/148 132/471/148
f 133/472/148 139/473/148 140/474/148
f 127/477/149 135/476/149 136/475/149
f 135/476/149 127/477/149 128/478/149

g leg

v -0.04349409 1.341783E-09 -0.1934645
v -0.1767482 0.1379548 -0.2291698
v -0.04152131 0.04343766 -0.155857
v -0.1440603 0.1495938 -0.1833323
v 0.1618397 0.05049495 -0.2316669
v 0.1862269 0.1447198 -0.2251323
v 0.1403943 0.08229352 -0.274492
v 0.1779262 0.2273056 -0.2644353
v 0.2106141 0.2389446 -0.2185978
v -0.1065284 0.2946059 -0.1732756
v -0.1279738 0.3264045 -0.2161007
v 0.03354246 0.3334618 -0.1357437
v 0.05405466 0.3768994 -0.1673263
v 0.143987 0.307922 -0.2364505
v 0.1206817 0.307922 -0.1494737
v 0.07736001 0.3768994 -0.2543031
v -0.02018873 2.683566E-09 -0.2804412
v -0.1534428 0.1379548 -0.3161466
v 0.1629215 0.1447198 -0.1381555
v 0.1873087 0.2389446 -0.131621
v 0.2276525 0.1845412 -0.1208109
v 0.1959726 0.3069429 -0.1292995
v 0.0003234595 0.04343766 -0.3120238
v -0.1022155 0.1495938 -0.3394991
v 0.09854957 0.08229352 -0.1183251
v 0.1360815 0.2273055 -0.1082685
v 0.07538723 0.3334618 -0.2919106
v 0.1385343 0.05049495 -0.1446901
v -0.1046684 0.3264045 -0.3030775
v 0.2509578 0.1845412 -0.2077877
v 0.219278 0.3069429 -0.2162763
v -0.06468368 0.2946059 -0.3294424
v 0.2407258 0.2129751 -0.1990382
v 0.223166 0.2129751 -0.1335043
v 0.2237644 0.278509 -0.203583
v 0.2062046 0.278509 -0.1380491
v 0.4253323 0.2296975 -0.08743853
v 0.3772592 0.2632632 -0.1003197
v 0.446813 0.2626714 -0.08168278
v 0.3987399 0.296237 -0.09456393
v 0.3642119 0.3136739 -0.1038157
v 0.4241615 0.3501902 -0.08775225
v 0.3896335 0.3676271 -0.097004
v 0.3777194 0.3136739 -0.1542263
v 0.3907667 0.2632632 -0.1507303
v 0.4388398 0.2296976 -0.1378492
v 0.4603205 0.2626714 -0.1320934
v 0.4122474 0.296237 -0.1449746
v 0.4376689 0.3501902 -0.1381629
v 0.403141 0.3676271 -0.1474147

vn -0.4674555 -0.7853001 0.9315653
vn -1.022747 -0.2104205 0.7827755
vn 0.8194959 -0.5748795 -0.8372364
vn 1.072808 -0.228633 -0.7069907
vn 1.022747 0.2104205 -0.7827755
vn -0.8194959 0.5748795 0.8372364
vn -0.06095432 0.7853001 1.040487
vn 0.4896897 1.202502 0.131212
vn 0.32625 1.260533 0.08741842
vn -0.32625 -1.260533 -0.08741842
vn -1.217582 -0.3377588 -0.32625
vn -0.3377588 0 1.260533
vn 0.06095432 -0.7853001 -1.040487
vn -0.4943367 -0.2104205 -1.189277
vn 0.4674555 0.7853001 -0.9315653
vn 0.8519651 0.6246369 -0.7661653
vn 0.2910861 -0.5748795 1.134816
vn 0.5755832 -0.228633 1.148676
vn 0.4943367 0.2104205 1.189277
vn -0.8913316 0.9227743 -0.2388316
vn 0.8913316 -0.9227743 0.2388316
vn 0.3377588 0 -1.260533
vn 0.6439288 -1.121878 0.1725402
vn 1.004848 -0.7879156 0.2692482
vn -0.2910861 0.5748795 -1.134816
vn 0.3547407 0.6246369 1.089501
vn 0.0158332 1.304897 0.004242492
vn 1.217582 0.3377588 0.32625
vn -0.3146153 0.006403193 1.266492
vn -0.2682099 1.275117 -0.07186662
vn 0.3950535 0.01599883 -1.243664
vn 0.360781 0.006403232 -1.254122
vn 0.3835577 -1.243119 0.102774
vn -1.13293 0.5721375 -0.3035676
vn -0.2797058 0.0159988 1.274572
vn 1.045067 -0.7296885 0.2800249
vn 0.7048249 1.081933 0.1888573
vn 1.13293 -0.5721375 0.3035676
vn 0.5526424 1.172895 0.1480801
vn -0.7048249 -1.081933 -0.1888573


usemtl brownDark

f 143/313/150 142/312/151 141/311/150
f 142/312/151 143/313/150 144/314/151
f 147/317/152 146/316/153 145/315/152
f 146/316/153 147/317/152 148/318/154
f 146/316/153 148/318/154 149/319/154
f 152/322/156 151/321/155 150/320/155
f 151/321/155 152/322/156 153/323/156
f 156/326/158 155/325/157 154/324/157
f 155/325/157 156/326/158 153/327/158
f 141/330/159 158/329/160 157/328/159
f 158/329/160 141/330/159 142/331/160
f 161/334/161 160/333/161 159/332/161
f 160/333/161 161/334/161 162/335/161
f 160/333/161 162/335/161 155/336/161
f 158/339/163 163/338/162 157/337/162
f 163/338/162 158/339/163 164/340/163
f 165/343/161 144/342/161 143/341/161
f 144/342/161 165/343/161 166/344/161
f 144/342/161 166/344/161 150/345/161
f 150/345/161 166/344/161 152/346/161
f 167/349/164 149/348/154 148/347/154
f 149/348/154 167/349/164 154/350/165
f 154/350/165 167/349/164 156/351/164
f 159/354/167 165/353/166 168/352/166
f 165/353/166 159/354/167 166/355/168
f 166/355/168 159/354/167 160/356/168
f 142/359/160 169/358/169 158/357/160
f 169/358/169 142/359/160 151/360/169
f 141/363/159 145/362/170 168/361/170
f 145/362/170 141/363/159 157/364/159
f 149/367/171 170/366/171 146/365/171
f 170/366/171 149/367/171 171/368/171
f 171/368/171 149/367/171 154/369/171
f 161/370/172 146/373/173 170/371/172
f 146/373/173 161/370/172 159/372/173
f 168/376/166 143/375/150 141/374/150
f 143/375/150 168/376/166 165/377/166
f 169/380/174 164/379/163 158/378/163
f 164/379/163 169/380/174 172/381/174
f 169/384/169 153/383/158 156/382/158
f 153/383/158 169/384/169 151/385/169
f 169/388/174 167/387/164 172/386/174
f 167/387/164 169/388/174 156/389/164
f 164/392/171 147/391/171 163/390/171
f 147/391/171 164/392/171 148/393/171
f 148/393/171 164/392/171 172/394/171
f 148/393/171 172/394/171 167/395/171
f 163/398/162 145/397/152 157/396/162
f 145/397/152 163/398/162 147/399/152
f 160/402/168 152/401/156 166/400/168
f 152/401/156 160/402/168 155/403/175
f 152/401/156 155/403/175 153/404/156
f 144/407/151 151/406/155 142/405/151
f 151/406/155 144/407/151 150/408/155
f 146/411/173 168/410/170 145/409/170
f 168/410/170 146/411/173 159/412/173
f 171/415/176 155/414/157 162/413/176
f 155/414/157 171/415/176 154/416/157
f 170/419/177 173/418/177 161/417/177
f 173/418/177 170/419/177 171/420/177
f 161/417/177 173/418/177 174/421/177
f 171/420/177 175/422/177 173/418/177
f 161/417/177 174/421/177 176/423/177
f 175/422/177 171/420/177 162/424/177
f 175/422/177 162/424/177 176/423/177
f 176/423/177 162/424/177 161/417/177

usemtl brownLight

f 179/427/161 178/426/178 177/425/161
f 178/426/178 179/427/161 180/428/161
f 178/426/178 180/428/161 181/429/178
f 181/429/178 180/428/161 182/430/161
f 181/429/178 182/430/161 183/431/161
f 175/434/179 181/433/179 184/432/179
f 181/433/179 175/434/179 176/435/179
f 175/438/180 185/437/181 173/436/180
f 185/437/181 175/438/180 184/439/181
f 174/442/182 185/441/182 178/440/182
f 185/441/182 174/442/182 173/443/182
f 185/446/181 187/445/171 186/444/171
f 187/445/171 185/446/181 188/447/171
f 188/447/171 185/446/181 184/448/181
f 188/447/171 184/448/181 189/449/171
f 189/449/171 184/448/181 190/450/171
f 181/453/183 190/452/183 184/451/183
f 190/452/183 181/453/183 183/454/183
f 178/457/178 176/456/184 174/455/184
f 176/456/184 178/457/178 181/458/178
f 187/461/185 177/460/185 186/459/185
f 177/460/185 187/461/185 179/462/185
f 188/465/177 179/464/186 187/463/186
f 179/464/186 188/465/177 180/466/177
f 189/469/187 180/468/177 188/467/177
f 180/468/177 189/469/187 182/470/187
f 190/474/188 182/471/188 189/473/188
f 182/471/188 190/474/188 183/472/188
f 177/477/189 185/476/189 186/475/189
f 185/476/189 177/477/189 178/478/189
`