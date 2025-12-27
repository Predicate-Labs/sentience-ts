/**
 * Inspector tool - helps developers see what the agent "sees"
 */

import { SentienceBrowser } from './browser';

export class Inspector {
  private active: boolean = false;

  constructor(private browser: SentienceBrowser) {}

  async start(): Promise<void> {
    const page = this.browser.getPage();
    this.active = true;

    // Inject inspector script into page
    await page.evaluate(() => {
      // Remove existing inspector if any
      if ((window as any).__sentience_inspector_active) {
        return;
      }

      (window as any).__sentience_inspector_active = true;
      (window as any).__sentience_last_element_id = null;

      // Get element at point
      function getElementAtPoint(x: number, y: number): number | null {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;

        // Find element in registry
        const registry = (window as any).sentience_registry;
        if (registry) {
          for (let i = 0; i < registry.length; i++) {
            if (registry[i] === el) {
              return i;
            }
          }
        }
        return null;
      }

      // Mouse move handler
      function handleMouseMove(e: MouseEvent) {
        if (!(window as any).__sentience_inspector_active) return;

        const elementId = getElementAtPoint(e.clientX, e.clientY);
        if (elementId === null || elementId === (window as any).__sentience_last_element_id) {
          return;
        }

        (window as any).__sentience_last_element_id = elementId;

        // Get element info from snapshot if available
        const sentience = (window as any).sentience;
        const registry = (window as any).sentience_registry;
        if (sentience && registry) {
          const el = registry[elementId];
          if (el) {
            const rect = el.getBoundingClientRect();
            const text =
              el.getAttribute('aria-label') ||
              (el as HTMLInputElement).value ||
              (el as HTMLInputElement).placeholder ||
              (el as HTMLImageElement).alt ||
              (el.innerText || '').substring(0, 50);

            const role = el.getAttribute('role') || el.tagName.toLowerCase();

            console.log(
              `[Sentience Inspector] Element #${elementId}: role=${role}, text="${text}", bbox=(${Math.round(rect.x)}, ${Math.round(rect.y)}, ${Math.round(rect.width)}, ${Math.round(rect.height)})`
            );
          }
        }
      }

      // Click handler
      function handleClick(e: MouseEvent) {
        if (!(window as any).__sentience_inspector_active) return;

        e.preventDefault();
        e.stopPropagation();

        const elementId = getElementAtPoint(e.clientX, e.clientY);
        if (elementId === null) return;

        // Get full element info
        const sentience = (window as any).sentience;
        const registry = (window as any).sentience_registry;
        if (sentience && registry) {
          const el = registry[elementId];
          if (el) {
            const rect = el.getBoundingClientRect();
            const info = {
              id: elementId,
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute('role') || 'generic',
              text:
                el.getAttribute('aria-label') ||
                (el as HTMLInputElement).value ||
                (el as HTMLInputElement).placeholder ||
                (el as HTMLImageElement).alt ||
                (el.innerText || '').substring(0, 100),
              bbox: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
              attributes: {
                id: el.id || null,
                class: el.className || null,
                name: (el as HTMLInputElement).name || null,
                type: (el as HTMLInputElement).type || null,
              },
            };

            console.log('[Sentience Inspector] Clicked element:', JSON.stringify(info, null, 2));

            // Also try to get from snapshot if available
            if (sentience && sentience.snapshot) {
              sentience
                .snapshot({ limit: 100 })
                .then((snap: any) => {
                  const element = snap.elements.find((el: any) => el.id === elementId);
                  if (element) {
                    console.log('[Sentience Inspector] Snapshot element:', JSON.stringify(element, null, 2));
                  }
                })
                .catch(() => {});
            }
          }
        }
      }

      // Add event listeners
      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('click', handleClick, true);

      // Store cleanup function
      (window as any).__sentience_inspector_cleanup = () => {
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('click', handleClick, true);
        (window as any).__sentience_inspector_active = false;
      };

      console.log('[Sentience Inspector] ✅ Inspection mode active. Hover elements to see info, click to see full details.');
    });
  }

  async stop(): Promise<void> {
    const page = this.browser.getPage();
    this.active = false;

    // Cleanup inspector
    await page.evaluate(() => {
      if ((window as any).__sentience_inspector_cleanup) {
        (window as any).__sentience_inspector_cleanup();
      }
    });
  }
}

export function inspect(browser: SentienceBrowser): Inspector {
  return new Inspector(browser);
}



