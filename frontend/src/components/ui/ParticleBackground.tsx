import { useEffect, useRef } from 'react';

// Delicate frosted greenish tones (no dark green) to perfectly match the UI
const COLORS = [
    'rgba(16, 185, 129, 0.25)', // Faint Emerald
    'rgba(52, 211, 153, 0.35)', // Light Mint
    'rgba(110, 231, 183, 0.45)', // Very Light Mint
];

class Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    baseRadius: number;
    radius: number;
    color: string;
    targetX: number;
    targetY: number;

    constructor(canvasWidth: number, canvasHeight: number) {
        this.x = Math.random() * canvasWidth;
        this.y = Math.random() * canvasHeight;
        // Extremely slow, elegant drift
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = (Math.random() - 0.5) * 0.3;
        this.baseRadius = Math.random() * 0.8 + 0.2; // Much smaller, delicate dust-like sizes
        this.radius = this.baseRadius;
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
        this.targetX = this.x;
        this.targetY = this.y;
    }

    update(canvasWidth: number, canvasHeight: number, mouseX: number, mouseY: number) {
        // Normal drift
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off edges gently
        if (this.x < 0 || this.x > canvasWidth) this.vx *= -1;
        if (this.y < 0 || this.y > canvasHeight) this.vy *= -1;

        // Mouse interaction (repel)
        const dx = mouseX - this.x;
        const dy = mouseY - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDistance = 150; // Radius of interaction

        if (distance < maxDistance) {
            // Repel force
            const force = (maxDistance - distance) / maxDistance;
            const angle = Math.atan2(dy, dx);
            // Push away from mouse slowly
            this.x -= Math.cos(angle) * force * 2;
            this.y -= Math.sin(angle) * force * 2;
            // Slightly enlarge near mouse for wow factor
            this.radius = this.baseRadius + force * 1.5;
        } else {
            // Return to base size smoothly
            if (this.radius > this.baseRadius) {
                this.radius -= 0.05;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

export default function ParticleBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let particles: Particle[] = [];
        let animationFrameId: number;
        let mouseX = -1000;
        let mouseY = -1000;

        const resize = () => {
            // Use devicePixelRatio for retina display sharpness
            const dpr = window.devicePixelRatio || 1;
            canvas.width = window.innerWidth * dpr;
            canvas.height = window.innerHeight * dpr;
            ctx.scale(dpr, dpr);
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            initParticles();
        };

        const initParticles = () => {
            particles = [];
            // Calculate particle density for a massive field of interactive dots
            const count = Math.floor((window.innerWidth * window.innerHeight) / 1200);
            for (let i = 0; i < count; i++) {
                particles.push(new Particle(window.innerWidth, window.innerHeight));
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        const handleMouseLeave = () => {
            mouseX = -1000;
            mouseY = -1000;
        };

        const animate = () => {
            // Clear canvas with a slightly transparent fill to create a microscopic trail effect
            ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

            particles.forEach(p => {
                p.update(window.innerWidth, window.innerHeight, mouseX, mouseY);
                p.draw(ctx);
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        window.addEventListener('resize', resize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseleave', handleMouseLeave);

        resize();
        animate();

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseleave', handleMouseLeave);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 z-0 pointer-events-none"
            style={{ background: 'transparent' }}
        />
    );
}
