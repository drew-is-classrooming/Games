document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-board');
    const context = canvas.getContext('2d');
    const nextCanvas = document.getElementById('next-piece');
    const nextContext = nextCanvas.getContext('2d');
    const scoreElement = document.getElementById('score');
    const levelElement = document.getElementById('level');
    const highScoreElement = document.getElementById('high-score');
    const startButton = document.getElementById('start-button');
    const restartButton = document.getElementById('restart-button');

    const COLS = 10;
    const ROWS = 20;
    const BLOCK_SIZE = 30;
    const NEXT_COLS = 4;
    const NEXT_ROWS = 4;
    const NEXT_BLOCK_SIZE = 30;

    context.canvas.width = COLS * BLOCK_SIZE;
    context.canvas.height = ROWS * BLOCK_SIZE;

    nextContext.canvas.width = NEXT_COLS * NEXT_BLOCK_SIZE;
    nextContext.canvas.height = NEXT_ROWS * NEXT_BLOCK_SIZE;

    const COLORS = [
        null,
        '#FF0D72', // T
        '#0DC2FF', // I
        '#0DFF72', // O
        '#F538FF', // L
        '#FF8E0D', // J
        '#FFE138', // S
        '#3877FF'  // Z
    ];

    const SHAPES = [
        [], // 0 is empty
        [[1, 1, 1], [0, 1, 0]], // T
        [[2, 2, 2, 2]], // I
        [[3, 3], [3, 3]], // O
        [[4, 0, 0], [4, 4, 4]], // L
        [[0, 0, 5], [5, 5, 5]], // J
        [[0, 6, 6], [6, 6, 0]], // S
        [[7, 7, 0], [0, 7, 7]]  // Z
    ];

    const SOUNDS = {
        move: new Audio('sounds/move.wav'),
        rotate: new Audio('sounds/rotate.wav'),
        hardDrop: new Audio('sounds/hard_drop.wav'),
        lineClear: new Audio('sounds/line_clear.wav'),
        tetris: new Audio('sounds/tetris.wav'),
        gameOver: new Audio('sounds/game_over.wav'),
        theme: new Audio('sounds/theme.mp3')
    };
    SOUNDS.theme.loop = true;

    let board, piece, nextPiece, pieceBag;
    let highScore = localStorage.getItem('tetrisHighScore') || 0;
    let score, lines, level;
    let gameOver, paused, animationFrameId;

    highScoreElement.innerText = highScore;

    let dropCounter = 0;
    let dropInterval = 1000;
    let lastTime = 0;

    function createBoard(cols, rows) {
        return Array.from({ length: rows }, () => Array(cols).fill(0));
    }

    function createPiece(type) {
        const matrix = SHAPES[type];
        return {
            x: Math.floor(COLS / 2) - Math.floor(matrix[0].length / 2),
            y: 0,
            matrix: matrix,
            type: type
        };
    }

    function fillPieceBag() {
        const pieces = [1, 2, 3, 4, 5, 6, 7];
        for (let i = pieces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
        }
        pieceBag = pieces;
    }

    function getRandomPiece() {
        if (pieceBag.length === 0) fillPieceBag();
        const type = pieceBag.pop();
        return createPiece(type);
    }

    function resetGame() {
        board = createBoard(COLS, ROWS);
        score = 0;
        lines = 0;
        level = 0;
        dropInterval = 1000;
        gameOver = false;
        paused = false;
        fillPieceBag();
        fillPieceBag();
        document.getElementById('pause-overlay').classList.add('hidden');
        piece = getRandomPiece();
        nextPiece = getRandomPiece();
        updateUI(true);
        SOUNDS.theme.currentTime = 0;
        SOUNDS.theme.play();
        restartButton.classList.add('hidden');
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        gameLoop();
    }

    function drawMatrix(matrix, offset, ctx, size) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    ctx.fillStyle = COLORS[value];
                    ctx.fillRect((x + offset.x) * size, (y + offset.y) * size, size, size);
                    ctx.strokeStyle = '#111';
                    ctx.lineWidth = 2;
                    ctx.strokeRect((x + offset.x) * size, (y + offset.y) * size, size, size);
                }
            });
        });
    }

    function draw() {
        context.fillStyle = '#111';
        context.fillRect(0, 0, canvas.width, canvas.height);
        drawMatrix(board, { x: 0, y: 0 }, context, BLOCK_SIZE);
        drawMatrix(piece.matrix, { x: piece.x, y: piece.y }, context, BLOCK_SIZE);
        drawGhostPiece();

        nextContext.fillStyle = '#111';
        nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
        const nextPieceX = NEXT_COLS / 2 - Math.floor(nextPiece.matrix[0].length / 2);
        const nextPieceY = NEXT_ROWS / 2 - Math.floor(nextPiece.matrix.length / 2);
        drawMatrix(nextPiece.matrix, { x: nextPieceX, y: nextPieceY }, nextContext, NEXT_BLOCK_SIZE);
    }

    function drawGhostPiece() {
        const ghost = JSON.parse(JSON.stringify(piece));
        while (!checkCollision(board, ghost)) ghost.y++;
        ghost.y--;
        ghost.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    context.fillStyle = 'rgba(255,255,255,0.2)';
                    context.fillRect((x + ghost.x) * BLOCK_SIZE, (y + ghost.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                }
            });
        });
    }

    function pieceDrop() {
        piece.y++;
        if (checkCollision(board, piece)) {
            piece.y--;
            merge(board, piece);
            clearLines();
            piece = nextPiece;
            nextPiece = getRandomPiece();
            if (checkCollision(board, piece)) {
                gameOver = true;
                SOUNDS.theme.pause();
                updateHighScore();
                showGameOver();
                restartButton.classList.remove('hidden');
            }
        }
        dropCounter = 0;
    }

    function checkCollision(board, piece) {
        for (let y = 0; y < piece.matrix.length; y++) {
            for (let x = 0; x < piece.matrix[y].length; x++) {
                if (piece.matrix[y][x] !== 0 &&
                    (board[y + piece.y] && board[y + piece.y][x + piece.x]) !== 0) {
                    return true;
                }
            }
        }
        return false;
    }

    function merge(board, piece) {
        piece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    board[y + piece.y][x + piece.x] = value;
                }
            });
        });
    }

    function clearLines() {
        let linesCleared = 0;
        outer: for (let y = board.length - 1; y > 0; --y) {
            for (let x = 0; x < board[y].length; ++x) {
                if (board[y][x] === 0) continue outer;
            }
            const row = board.splice(y, 1)[0].fill(0);
            board.unshift(row);
            ++y;
            linesCleared++;
        }

        if (linesCleared > 0) {
            if (linesCleared === 4) SOUNDS.tetris.play();
            else SOUNDS.lineClear.play();
        }

        if (linesCleared > 0) {
            lines += linesCleared;
            const linePoints = [0, 40, 100, 300, 1200];
            score += linePoints[linesCleared] * (level + 1);
            if (Math.floor(lines / 10) > level) {
                level = Math.floor(lines / 10);
                dropInterval = Math.max(100, 1000 - level * 50);
            }
        }
    }

    function move(dir) {
        piece.x += dir;
        if (checkCollision(board, piece)) piece.x -= dir;
        else SOUNDS.move.play();
    }

    function rotate() {
        const originalMatrix = piece.matrix;
        const rotated = [];
        for (let y = 0; y < originalMatrix[0].length; y++) {
            rotated.push([]);
            for (let x = 0; x < originalMatrix.length; x++) {
                rotated[y][x] = originalMatrix[originalMatrix.length - 1 - x][y];
            }
        }
        piece.matrix = rotated;
        let offset = 1;
        while (checkCollision(board, piece)) {
            piece.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (offset > piece.matrix[0].length) {
                piece.matrix = originalMatrix;
                return;
            }
        }
        SOUNDS.rotate.play();
    }

    function updateUI() {
        scoreElement.innerText = score;
        levelElement.innerText = level;
    }

    function updateHighScore() {
        if (score > highScore) {
            highScore = score;
            highScoreElement.innerText = highScore;
            localStorage.setItem('tetrisHighScore', highScore);
        }
    }

    function showGameOver() {
        SOUNDS.gameOver.play();
        context.fillStyle = 'rgba(0,0,0,0.75)';
        context.fillRect(0, canvas.height / 2 - 50, canvas.width, 100);
        context.font = '30px "Press Start 2P"';
        context.fillStyle = '#e60000';
        context.textAlign = 'center';
        context.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
    }

    function togglePause() {
        if (gameOver) return;
        paused = !paused;
        const pauseOverlay = document.getElementById('pause-overlay');
        if (paused) {
            SOUNDS.theme.pause();
            pauseOverlay.classList.remove('hidden');
            cancelAnimationFrame(animationFrameId);
        } else {
            SOUNDS.theme.play();
            pauseOverlay.classList.add('hidden');
            gameLoop();
        }
    }

    function gameLoop(time = 0) {
        if (gameOver || paused) return;
        const deltaTime = time - lastTime;
        lastTime = time;
        dropCounter += deltaTime;
        if (dropCounter > dropInterval) pieceDrop();
        draw();
        updateUI();
        animationFrameId = requestAnimationFrame(gameLoop);
    }

    document.addEventListener('keydown', event => {
        if (gameOver || paused) return;
        switch (event.key) {
            case 'ArrowLeft':
            case 'a':
                move(-1);
                break;
            case 'ArrowRight':
            case 'd':
                move(1);
                break;
            case 'ArrowDown':
            case 's':
                pieceDrop();
                break;
            case 'ArrowUp':
            case 'w':
                rotate();
                break;
            case ' ':
                while (!checkCollision(board, piece)) piece.y++;
                piece.y--;
                merge(board, piece);
                clearLines();
                piece = nextPiece;
                nextPiece = getRandomPiece();
                if (checkCollision(board, piece)) {
                    gameOver = true;
                    showGameOver();
                    restartButton.classList.remove('hidden');
                }
                SOUNDS.hardDrop.play();
                dropCounter = 0;
                break;
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key.toLowerCase() === 'p') togglePause();
    });

    startButton.addEventListener('click', resetGame);
    restartButton.addEventListener('click', resetGame);

    function init() {
        context.fillStyle = '#111';
        context.fillRect(0, 0, canvas.width, canvas.height);
        nextContext.fillStyle = '#111';
        nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
        context.font = '20px "Press Start 2P"';
        context.fillStyle = '#fff';
        context.textAlign = 'center';
        context.fillText('Press Start', canvas.width / 2, canvas.height / 2);
    }

    init();
});
