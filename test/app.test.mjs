import assert from 'node:assert';
import { calculateDateDifference, formatArabicDuration } from '../src/lib/dateCalculator.ts';
import { hashPassword, verifyPassword } from '../src/lib/auth.ts';

async function runTests() {
  console.log('--- 1. Testing WebCrypto PBKDF2 Password Hashing & Verification ---');
  const password = 'SuperSecretPassword123!';
  const { hash, salt } = await hashPassword(password);
  assert(hash.length > 20, 'Hash should not be empty');
  assert(salt.length > 10, 'Salt should not be empty');

  const isValid = await verifyPassword(password, hash, salt);
  assert.strictEqual(isValid, true, 'Valid password verification must return true');

  const isInvalid = await verifyPassword('WrongPassword', hash, salt);
  assert.strictEqual(isInvalid, false, 'Invalid password verification must return false');
  console.log('✓ Password hashing and verification passed!');

  console.log('--- 2. Testing Date Difference & Calendar Breakdown ---');
  const start = new Date('2026-01-01T00:00:00Z');
  const end = new Date('2026-02-15T12:30:00Z');
  const diff = calculateDateDifference(start, end, 'friday_saturday');

  assert.strictEqual(diff.isPast, false, 'Future date should have isPast = false');
  assert.strictEqual(diff.totalDays, 45, 'Total days between Jan 1 and Feb 15 should be 45');
  assert.strictEqual(diff.months, 1, 'Months should be 1');
  assert(diff.workingDays > 0 && diff.workingDays <= 45, 'Working days should be within range');
  console.log(`✓ Date calculation passed! Total days: ${diff.totalDays}, Working days: ${diff.workingDays}`);

  console.log('--- 3. Testing Arabic Duration Formatting ---');
  const pastDate = new Date('2025-01-01T00:00:00Z');
  const refDate = new Date('2026-01-01T00:00:00Z');
  const formattedPast = formatArabicDuration(pastDate, 'days', refDate);
  assert(formattedPast.isPast, 'Should detect past date');
  assert(formattedPast.formatted.includes('مضى منذ'), 'Should include مضى منذ prefix');

  const futureDate = new Date('2027-01-01T00:00:00Z');
  const formattedFuture = formatArabicDuration(futureDate, 'days', refDate);
  assert(!formattedFuture.isPast, 'Should detect future date');
  assert(formattedFuture.formatted.includes('متبقي'), 'Should include متبقي prefix');
  console.log(`✓ Arabic formatting passed! (${formattedFuture.formatted})`);

  console.log('\nAll unit tests passed cleanly!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
