// Game Configuration
const CONFIG = {
    canvas: {
        width: 1200,
        height: 800
    },
    player: {
        size: 16,
        speed: 2.5,
        sprintMultiplier: 1.8,
        startX: 100,
        startY: 400
    },
    oxygen: {
        max: 100,
        drainRate: 0.08,
        sprintDrainMultiplier: 2.5,
        tankRestore: 40
    },
    monster: {
        size: 24,
        baseSpeed: 1.2,
        speedIncrease: 0.0003,
        maxSpeed: 3.5,
        startDistance: 800
    },
    vent: {
        wallThickness: 80,
        segmentLength: 150,
        turningChance: 0.15
    }
};

// Game State
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CONFIG.canvas.width;
        this.canvas.height = CONFIG.canvas.height;

        this.keys = {};
        this.player = null;
        this.monster = null;
        this.ventSystem = null;
        this.oxygenTanks = [];
        this.particles = [];
        this.camera = { x: 0, y: 0 };
        this.distance = 0;
        this.gameRunning = false;
        this.oxygen = CONFIG.oxygen.max;
        this.lastOxygenWarning = 0;
        this.flashAlpha = 0;
        this.ambientSound = 0;

        this.setupControls();
        this.setupUI();
    }

    setupControls() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    setupUI() {
        document.getElementById('startButton').addEventListener('click', () => {
            document.getElementById('startScreen').classList.add('hidden');
            this.start();
        });

        document.getElementById('restartButton').addEventListener('click', () => {
            document.getElementById('gameOverScreen').classList.add('hidden');
            this.start();
        });
    }

    start() {
        this.gameRunning = true;
        this.oxygen = CONFIG.oxygen.max;
        this.distance = 0;
        this.particles = [];
        this.oxygenTanks = [];

        this.player = new Player(CONFIG.player.startX, CONFIG.player.startY);
        this.monster = new Monster(-CONFIG.monster.startDistance, CONFIG.player.startY);
        this.ventSystem = new VentSystem();

        this.spawnOxygenTank();
        this.gameLoop();
    }

    gameLoop() {
        if (!this.gameRunning) return;

        this.update();
        this.render();
        requestAnimationFrame(() => this.gameLoop());
    }

    update() {
        // Player movement
        const isSprinting = this.keys['shift'];
        const moveSpeed = isSprinting ?
            CONFIG.player.speed * CONFIG.player.sprintMultiplier :
            CONFIG.player.speed;

        let dx = 0;
        let dy = 0;

        if (this.keys['w'] || this.keys['arrowup']) dy -= moveSpeed;
        if (this.keys['s'] || this.keys['arrowdown']) dy += moveSpeed;
        if (this.keys['a'] || this.keys['arrowleft']) dx -= moveSpeed;
        if (this.keys['d'] || this.keys['arrowright']) dx += moveSpeed;

        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }

        this.player.move(dx, dy, this.ventSystem);

        // Update distance
        if (dx > 0) {
            this.distance += Math.abs(dx);
        }

        // Oxygen management
        const oxygenDrain = isSprinting ?
            CONFIG.oxygen.drainRate * CONFIG.oxygen.sprintDrainMultiplier :
            CONFIG.oxygen.drainRate;

        this.oxygen -= oxygenDrain;
        this.oxygen = Math.max(0, this.oxygen);

        // Oxygen warnings
        if (this.oxygen < 30 && Date.now() - this.lastOxygenWarning > 3000) {
            this.showMessage('OXYGEN LOW', 2000);
            this.lastOxygenWarning = Date.now();
            this.flashAlpha = 0.3;
        }

        // Update monster
        const monsterSpeed = Math.min(
            CONFIG.monster.baseSpeed + (this.distance * CONFIG.monster.speedIncrease),
            CONFIG.monster.maxSpeed
        );
        this.monster.update(this.player, monsterSpeed);

        // Check oxygen tank collection
        this.oxygenTanks = this.oxygenTanks.filter(tank => {
            const dist = Math.hypot(this.player.x - tank.x, this.player.y - tank.y);
            if (dist < 30) {
                this.oxygen = Math.min(CONFIG.oxygen.max, this.oxygen + CONFIG.oxygen.tankRestore);
                this.showMessage('+OXYGEN', 1000);
                this.createParticles(tank.x, tank.y, '#00ff88', 20);
                return false;
            }
            return true;
        });

        // Spawn new oxygen tanks
        if (this.oxygenTanks.length === 0 ||
            this.player.x - this.oxygenTanks[this.oxygenTanks.length - 1].x > 400) {
            this.spawnOxygenTank();
        }

        // Update particles
        this.particles = this.particles.filter(p => {
            p.update();
            return p.life > 0;
        });

        // Update camera
        this.camera.x = this.player.x - CONFIG.canvas.width / 3;
        this.camera.y = this.player.y - CONFIG.canvas.height / 2;

        // Check game over conditions
        if (this.oxygen <= 0) {
            this.gameOver('You suffocated in the darkness...');
        }

        const distToMonster = Math.hypot(this.player.x - this.monster.x, this.player.y - this.monster.y);
        if (distToMonster < 35) {
            this.gameOver('It caught you...');
        }

        // Update flash
        if (this.flashAlpha > 0) {
            this.flashAlpha -= 0.01;
        }

        // Update UI
        document.getElementById('oxygenFill').style.width = this.oxygen + '%';
        document.getElementById('distance').textContent = `Distance: ${Math.floor(this.distance / 10)}m`;
    }

    render() {
        const ctx = this.ctx;

        // Clear
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();
        ctx.translate(-this.camera.x, -this.camera.y);

        // Render vent system
        this.ventSystem.render(ctx, this.camera);

        // Render oxygen tanks
        this.oxygenTanks.forEach(tank => tank.render(ctx));

        // Render particles
        this.particles.forEach(p => p.render(ctx));

        // Render player
        this.player.render(ctx);

        // Render monster (with distance effect)
        const distToMonster = Math.hypot(this.player.x - this.monster.x, this.player.y - this.monster.y);
        if (distToMonster < 1000) {
            this.monster.render(ctx, distToMonster);
        }

        ctx.restore();

        // Vignette effect
        const gradient = ctx.createRadialGradient(
            this.canvas.width / 2, this.canvas.height / 2, 200,
            this.canvas.width / 2, this.canvas.height / 2, this.canvas.width / 1.5
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Flash effect
        if (this.flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 0, 0, ${this.flashAlpha})`;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    spawnOxygenTank() {
        const baseX = this.oxygenTanks.length > 0 ?
            this.oxygenTanks[this.oxygenTanks.length - 1].x + 400 + Math.random() * 300 :
            this.player.x + 300;

        const y = CONFIG.canvas.height / 2 + (Math.random() - 0.5) * 200;
        this.oxygenTanks.push(new OxygenTank(baseX, y));
    }

    createParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    showMessage(text, duration) {
        const msgEl = document.getElementById('messages');
        msgEl.textContent = text;
        msgEl.style.opacity = '1';
        setTimeout(() => {
            msgEl.style.opacity = '0';
        }, duration);
    }

    gameOver(message) {
        this.gameRunning = false;
        document.getElementById('deathMessage').textContent = message;
        document.getElementById('score').textContent = `You traveled ${Math.floor(this.distance / 10)} meters`;
        document.getElementById('gameOverScreen').classList.remove('hidden');
    }
}

// Player Class
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = CONFIG.player.size;
        this.flashlightAngle = 0;
    }

    move(dx, dy, ventSystem) {
        const newX = this.x + dx;
        const newY = this.y + dy;

        if (!ventSystem.checkCollision(newX, this.y, this.size)) {
            this.x = newX;
        }
        if (!ventSystem.checkCollision(this.x, newY, this.size)) {
            this.y = newY;
        }

        if (dx !== 0 || dy !== 0) {
            this.flashlightAngle = Math.atan2(dy, dx);
        }
    }

    render(ctx) {
        // Flashlight beam
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.flashlightAngle);

        const gradient = ctx.createLinearGradient(0, 0, 200, 0);
        gradient.addColorStop(0, 'rgba(255, 255, 150, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 255, 150, 0)');

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(200, -50);
        ctx.lineTo(200, 50);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.restore();

        // Player body
        ctx.fillStyle = '#4488ff';
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);

        // Player highlight
        ctx.fillStyle = '#88bbff';
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size / 2, this.size / 2);
    }
}

// Monster Class
class Monster {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = CONFIG.monster.size;
        this.tentacles = [];
        for (let i = 0; i < 6; i++) {
            this.tentacles.push({
                angle: (Math.PI * 2 / 6) * i,
                length: 20 + Math.random() * 10,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    update(player, speed) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0) {
            this.x += (dx / dist) * speed;
            this.y += (dy / dist) * speed;
        }

        // Update tentacles
        this.tentacles.forEach(t => {
            t.phase += 0.1;
        });
    }

    render(ctx, distToPlayer) {
        const alpha = Math.max(0, Math.min(1, 1 - distToPlayer / 800));

        ctx.save();
        ctx.globalAlpha = alpha;

        // Tentacles
        this.tentacles.forEach(t => {
            const waveOffset = Math.sin(t.phase) * 5;
            const endX = this.x + Math.cos(t.angle) * (t.length + waveOffset);
            const endY = this.y + Math.sin(t.angle) * (t.length + waveOffset);

            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.quadraticCurveTo(
                this.x + Math.cos(t.angle) * t.length / 2,
                this.y + Math.sin(t.angle) * t.length / 2 + waveOffset,
                endX,
                endY
            );
            ctx.stroke();
        });

        // Body
        ctx.fillStyle = '#330000';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(this.x - 6, this.y - 4, 3, 0, Math.PI * 2);
        ctx.arc(this.x + 6, this.y - 4, 3, 0, Math.PI * 2);
        ctx.fill();

        // Glow
        const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 2);
        glow.addColorStop(0, 'rgba(255, 0, 0, 0.3)');
        glow.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// Vent System Class
class VentSystem {
    constructor() {
        this.walls = [];
        this.generateVents();
    }

    generateVents() {
        let x = -500;
        let y = CONFIG.canvas.height / 2;
        const wallHeight = CONFIG.vent.wallThickness;

        for (let i = 0; i < 100; i++) {
            // Top wall
            this.walls.push({
                x: x,
                y: y - CONFIG.canvas.height / 4,
                width: CONFIG.vent.segmentLength,
                height: wallHeight
            });

            // Bottom wall
            this.walls.push({
                x: x,
                y: y + CONFIG.canvas.height / 4,
                width: CONFIG.vent.segmentLength,
                height: wallHeight
            });

            x += CONFIG.vent.segmentLength;

            // Occasional vertical shifts
            if (Math.random() < CONFIG.vent.turningChance) {
                y += (Math.random() - 0.5) * 100;
                y = Math.max(CONFIG.canvas.height / 3, Math.min(CONFIG.canvas.height * 2 / 3, y));
            }
        }
    }

    checkCollision(x, y, size) {
        const halfSize = size / 2;
        return this.walls.some(wall =>
            x + halfSize > wall.x &&
            x - halfSize < wall.x + wall.width &&
            y + halfSize > wall.y &&
            y - halfSize < wall.y + wall.height
        );
    }

    render(ctx, camera) {
        this.walls.forEach(wall => {
            if (wall.x + wall.width < camera.x - 100 || wall.x > camera.x + CONFIG.canvas.width + 100) {
                return;
            }

            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(wall.x, wall.y, wall.width, wall.height);

            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);

            // Grid pattern
            ctx.strokeStyle = '#252525';
            ctx.lineWidth = 1;
            for (let i = 0; i < wall.width; i += 20) {
                ctx.beginPath();
                ctx.moveTo(wall.x + i, wall.y);
                ctx.lineTo(wall.x + i, wall.y + wall.height);
                ctx.stroke();
            }
        });
    }
}

// Oxygen Tank Class
class OxygenTank {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 20;
        this.pulse = 0;
    }

    render(ctx) {
        this.pulse += 0.05;
        const pulseSize = Math.sin(this.pulse) * 3;

        // Glow
        const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size + pulseSize + 10);
        glow.addColorStop(0, 'rgba(0, 255, 136, 0.5)');
        glow.addColorStop(1, 'rgba(0, 255, 136, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size + pulseSize + 10, 0, Math.PI * 2);
        ctx.fill();

        // Tank
        ctx.fillStyle = '#00ff88';
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);

        // Highlight
        ctx.fillStyle = '#88ffcc';
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size / 3, this.size / 3);

        // O2 label
        ctx.fillStyle = '#000';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('O2', this.x, this.y + 1);
    }
}

// Particle Class
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4;
        this.life = 1;
        this.color = color;
        this.size = Math.random() * 4 + 2;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.life -= 0.02;
    }

    render(ctx) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

// Initialize game
const game = new Game();
