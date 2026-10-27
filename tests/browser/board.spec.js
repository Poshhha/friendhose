import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('two independent visitors converse live with private ownership, OP labels, reports, and hearts', async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const visitor = await browser.newContext();
  const other = await visitor.newPage();
  const message = `A thought worth sharing ${Date.now()} 🌙`;
  await page.goto('/');
  await other.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Some things are easier said anonymously.' }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'What’s on your mind?' })
    .fill(`${message}\n\n<script>alert('plain text')</script>`);
  await page.getByRole('button', { name: 'Questions', exact: true }).click();
  await page.getByRole('button', { name: 'Let it out' }).click();
  const ownPost = page
    .getByRole('article')
    .filter({ has: page.getByText(message, { exact: false }) })
    .first();
  const remotePost = other
    .getByRole('article')
    .filter({ has: other.getByText(message, { exact: false }) })
    .first();
  await expect(ownPost).toBeVisible();
  await expect(remotePost).toBeVisible();
  await expect(
    remotePost.getByText("<script>alert('plain text')</script>", { exact: false }),
  ).toBeVisible();
  await expect(remotePost.getByText('Questions', { exact: true })).toBeVisible();
  await remotePost.getByRole('button', { name: 'Be the first to reply' }).click();
  await remotePost
    .getByRole('textbox', { name: 'Write an anonymous reply' })
    .fill('You are not alone in this.');
  await remotePost.getByRole('button', { name: 'Reply', exact: true }).click();
  await ownPost.getByRole('button', { name: '1 reply', exact: true }).click();
  await expect(ownPost.getByText('You are not alone in this.')).toBeVisible();
  const firstComment = ownPost
    .getByRole('article')
    .filter({ hasText: 'You are not alone in this.' });
  await firstComment.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(ownPost.getByText('Replying to', { exact: false }).first()).toBeVisible();
  await ownPost
    .getByRole('textbox', { name: 'Write an anonymous reply' })
    .fill('Thank you. I needed to hear that.');
  await ownPost.getByRole('button', { name: 'Reply', exact: true }).last().click();
  await expect(remotePost.getByText('Thank you. I needed to hear that.')).toBeVisible();
  await expect(remotePost.getByText('OP', { exact: true })).toBeVisible();
  const opComment = remotePost
    .getByRole('article')
    .filter({ hasText: 'Thank you. I needed to hear that.' });
  await expect(opComment.getByRole('button', { name: 'Replying to', exact: false })).toBeVisible();
  await remotePost.getByRole('button', { name: 'Send a heart', exact: true }).first().click();
  await expect(remotePost.getByRole('button', { name: 'Remove heart' }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    ownPost.getByRole('button', { name: 'Send a heart', exact: true }).first(),
  ).toContainText('1');
  await other.reload();
  await expect(remotePost).toBeVisible();
  await remotePost.getByRole('button', { name: /^Options for message/ }).click();
  await expect(other.getByRole('menuitem', { name: 'Delete your message' })).toHaveCount(0);
  await other.getByRole('menuitem', { name: 'Report message' }).click();
  await other.getByLabel('What’s the concern?').selectOption('Spam');
  await other.getByRole('button', { name: 'Send report' }).click();
  await expect(other.getByRole('status').filter({ hasText: 'moderation queue' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search conversations' }).fill(message);
  await expect(ownPost).toBeVisible();
  await expect(page.getByText('1 conversation matching', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByRole('button', { name: 'Unanswered', exact: true }).click();
  await expect(page.getByText(message, { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Most discussed', exact: true }).click();
  await expect(ownPost).toBeVisible();
  await ownPost.getByRole('button', { name: /^Options for message/ }).click();
  await page.getByRole('menuitem', { name: 'Delete your message' }).click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(other.getByText(message, { exact: false })).toHaveCount(0);
  await expect(page.getByText(message, { exact: false })).toHaveCount(0);
  expect(errors).toEqual([]);
  await visitor.close();
});

test('layout fits small screens and privacy dialog supports the keyboard', async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'What’s on your mind?' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Privacy & anonymity' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Anonymity has limits.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Privacy & anonymity' })).toBeFocused();
});

test('administrator can review a report and remove the reported message', async ({
  page,
  request,
}) => {
  const token = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const created = await request.post('/api/posts', {
    data: { body: `Moderation check ${Date.now()}`, deletionToken: token(), threadToken: token() },
  });
  const { post } = await created.json();
  await request.post(`/api/content/post/${post.id}/report`, {
    data: { reason: 'Spam', token: token() },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Administrator moderation tools' }).click();
  await page.getByLabel('Administrator key').fill('test-only-administrator-key-not-for-deployment');
  await page.getByRole('button', { name: 'Open queue' }).click();
  const report = page.getByRole('article').filter({ hasText: post.body });
  await report.getByRole('button', { name: 'Remove content' }).click();
  await page.getByRole('button', { name: 'Confirm removal' }).click();
  await expect(page.getByRole('dialog').getByText(post.body)).toHaveCount(0);
});

test('the board and privacy dialog meet automated WCAG accessibility checks', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Live conversations', { exact: true })).toBeVisible();
  const board = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(board.violations).toEqual([]);
  await page.getByRole('button', { name: 'Privacy & anonymity' }).click();
  const privacy = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(privacy.violations).toEqual([]);
});
