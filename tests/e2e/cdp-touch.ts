import { expect, type CDPSession, type Locator, type Page } from '@playwright/test';

interface Contact { id: number; x: number; y: number }
interface TargetPoint { x: number; y: number }

/** Chromium's native touch pipeline; never dispatches DOM events or keyboard substitutes. */
export class CdpTouch {
  private readonly contacts = new Map<number, Contact>();

  private constructor(private readonly page: Page, private readonly session: CDPSession) {}

  static async create(page: Page): Promise<CdpTouch> {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    return new CdpTouch(page, session);
  }

  private async point(target: Locator, relative: TargetPoint) {
    await expect(target).toBeVisible();
    const box = await target.boundingBox();
    if (!box) throw new Error('Touch target has no rendered bounding box');
    if (![relative.x, relative.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new Error('Touch target coordinates must be between zero and one');
    }
    const point = { x: box.x + box.width * relative.x, y: box.y + box.height * relative.y };
    const viewport = this.page.viewportSize();
    if (!viewport || point.x < 0 || point.y < 0 || point.x >= viewport.width || point.y >= viewport.height) {
      throw new Error(`Touch target is outside the current viewport: ${JSON.stringify({ point, viewport })}`);
    }
    return point;
  }

  /** Keep every existing contact held while adding another finger. */
  async down(id: number, target: Locator, relative: TargetPoint = { x: 0.5, y: 0.5 }): Promise<void> {
    if (this.contacts.has(id)) throw new Error(`Touch contact ${id} is already held`);
    if (this.contacts.size >= 5) throw new Error('This touch helper supports at most five fingers');
    this.contacts.set(id, { id, ...await this.point(target, relative) });
    await this.session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...this.contacts.values()] });
  }

  /** Moving a held contact exercises pointer capture and cancellation in the browser. */
  async move(id: number, target: Locator, relative: TargetPoint = { x: 0.5, y: 0.5 }): Promise<void> {
    if (!this.contacts.has(id)) throw new Error(`Touch contact ${id} is not held`);
    this.contacts.set(id, { id, ...await this.point(target, relative) });
    await this.session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [...this.contacts.values()] });
  }

  async endAll(): Promise<void> {
    await this.session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    this.contacts.clear();
  }

  async cancelAll(): Promise<void> {
    await this.session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    this.contacts.clear();
  }

  async dispose(): Promise<void> {
    try { if (this.contacts.size) await this.cancelAll(); }
    finally { await this.session.detach(); }
  }
}
