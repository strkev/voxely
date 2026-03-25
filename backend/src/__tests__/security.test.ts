import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimit } from 'express-rate-limit';
import { stripHtml, UUID_RE, ROOM_ID_RE } from '../lib/sanitization';

describe('Security Features', () => {

    describe('HTML Sanitization (stripHtml)', () => {
        it('should remove basic script tags', () => {
            const input = '<script>alert("xss")</script>Hello';
            expect(stripHtml(input)).toBe('Hello');
        });

        it('should remove event handlers like onerror', () => {
            const input = '<img src=x onerror=alert(1)>';
            expect(stripHtml(input)).toBe('');
        });

        it('should remove nested malicious tags', () => {
            const input = '<div><p><script>evil()</script>Safe Text</p></div>';
            expect(stripHtml(input)).toBe('Safe Text');
        });

        it('should trim whitespace from sanitized result', () => {
            const input = '   <b>Bold</b>   ';
            expect(stripHtml(input)).toBe('Bold');
        });

        it('should handle non-string inputs gracefully', () => {
            expect(stripHtml(null as any)).toBe('');
            expect(stripHtml(undefined as any)).toBe('');
        });
    });

    describe('Regex Validation', () => {
        it('should validate UUID v4 correctly', () => {
            expect(UUID_RE.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
            expect(UUID_RE.test('not-a-uuid')).toBe(false);
            expect(UUID_RE.test('12345678-1234-1234-1234-1234567890ab')).toBe(true);
        });

        it('should validate Room IDs correctly', () => {
            expect(ROOM_ID_RE.test('my-room-123')).toBe(true);
            expect(ROOM_ID_RE.test('invalid room!')).toBe(false);
            expect(ROOM_ID_RE.test('a'.repeat(101))).toBe(false);
            expect(ROOM_ID_RE.test('a'.repeat(100))).toBe(true);
        });
    });

    describe('API Rate Limiting', () => {
        it('should block requests after exceeding the limit', async () => {
            const app = express();
            
            // Define a very strict limiter for testing
            const testLimiter = rateLimit({
                windowMs: 60 * 1000,
                max: 3, // Only 3 requests allowed
                message: 'Too many requests'
            });

            app.get('/test', testLimiter, (req, res) => {
                res.status(200).send('OK');
            });

            // 1st request - OK
            await request(app).get('/test').expect(200);
            // 2nd request - OK
            await request(app).get('/test').expect(200);
            // 3rd request - OK
            await request(app).get('/test').expect(200);
            // 4th request - SHOULD BE BLOCKED
            const response = await request(app).get('/test');
            expect(response.status).toBe(429);
            expect(response.text).toBe('Too many requests');
        });
    });
});
