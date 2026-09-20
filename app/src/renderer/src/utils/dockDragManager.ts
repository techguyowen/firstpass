/**
 * Universal Pointer Drag Manager
 * Provides 60fps sub-pixel tracking, live ghost preview, and hit-testing
 * for flexible split lines, tab groups, side columns, and bottom docks.
 */

export interface DraggedItem {
  type: 'module-tab' | 'sorting-bar'
  id: string // moduleId or 'sorting-bar'
  title: string
  icon?: string
  sourceGroup?: string
  sourceZone: 'sidebar' | 'bottom' | 'floating' | 'triage'
}

export type DropTarget =
  | { type: 'split-line'; groupIndex: number; position: 'top' | 'between' | 'bottom' }
  | { type: 'tab-group'; groupId: string; insertIndex?: number }
  | { type: 'bottom-dock' }
  | { type: 'bottom-split'; groupIndex: number; side: 'left' | 'right' }
  | { type: 'bottom-tab-group'; groupId: string; groupIndex: number }
  | { type: 'side-dock'; side: 'left' | 'right' }
  | { type: 'sidebar-dock' }
  | { type: 'canvas'; x: number; y: number }

type DragListener = (state: DragState) => void

export interface DragState {
  isDragging: boolean
  item: DraggedItem | null
  currentPos: { x: number; y: number }
  dropTarget: DropTarget | null
}

class DockDragManager {
  private state: DragState = {
    isDragging: false,
    item: null,
    currentPos: { x: 0, y: 0 },
    dropTarget: null,
  }

  private listeners = new Set<DragListener>()
  private registeredDropZones = new Map<string, { rect: DOMRect; target: DropTarget }>()

  public subscribe(listener: DragListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  public registerDropZone(key: string, rect: DOMRect, target: DropTarget) {
    this.registeredDropZones.set(key, { rect, target })
  }

  public unregisterDropZone(key: string) {
    this.registeredDropZones.delete(key)
  }

  public startDrag(item: DraggedItem, initialX: number, initialY: number) {
    this.state = {
      isDragging: true,
      item,
      currentPos: { x: initialX, y: initialY },
      dropTarget: null,
    }
    this.notify()
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
  }

  public setDropTarget(target: DropTarget | null) {
    if (!this.state.isDragging) return
    this.state = {
      ...this.state,
      dropTarget: target,
    }
    this.notify()
  }

  public updateDrag(x: number, y: number, isModifierHeld: boolean, overrideTarget?: DropTarget | null) {
    if (!this.state.isDragging) return

    let target: DropTarget | null = overrideTarget ?? null

    // If modifier (Cmd/Ctrl) is held, force canvas float
    if (isModifierHeld) {
      target = { type: 'canvas', x, y }
    } else if (!target) {
      // 1. Live DOM hit-testing via elementsFromPoint
      try {
        const elements = document.elementsFromPoint(x, y)
        for (const el of elements) {
          // Bottom Stage Area horizontal split hit-testing
          const bottomGroupEl = el.closest('[data-bottom-group-index]') as HTMLElement | null
          if (bottomGroupEl) {
            const groupIdxStr = bottomGroupEl.getAttribute('data-bottom-group-index')
            const bGroupId = bottomGroupEl.getAttribute('data-bottom-group-id') || ''
            if (groupIdxStr !== null) {
              const rect = bottomGroupEl.getBoundingClientRect()
              const relX = (x - rect.left) / Math.max(1, rect.width)
              const groupIndex = parseInt(groupIdxStr, 10)
              if (relX < 0.28) {
                target = { type: 'bottom-split', groupIndex, side: 'left' }
              } else if (relX > 0.72) {
                target = { type: 'bottom-split', groupIndex, side: 'right' }
              } else {
                target = { type: 'bottom-tab-group', groupId: bGroupId, groupIndex }
              }
              break
            }
          }

          const splitIdx = el.getAttribute('data-split-index')
          if (splitIdx !== null) {
            target = {
              type: 'split-line',
              groupIndex: parseInt(splitIdx, 10),
              position: 'between',
            }
            break
          }

          const tabGroupId = el.getAttribute('data-tab-group-id')
          if (tabGroupId) {
            target = {
              type: 'tab-group',
              groupId: tabGroupId,
            }
            break
          }

          const dockZone = el.getAttribute('data-dock-zone')
          if (dockZone === 'bottom') {
            target = { type: 'bottom-dock' }
            break
          } else if (dockZone === 'sidebar') {
            const side = el.getAttribute('data-dock-side') === 'left' ? 'left' : 'right'
            target = { type: 'sidebar-dock' }
            break
          }
        }
      } catch {}

      // 2. Check registered dropzones
      if (!target) {
        for (const [, { rect, target: candidateTarget }] of this.registeredDropZones) {
          if (
            x >= rect.left &&
            x <= rect.right &&
            y >= rect.top &&
            y <= rect.bottom
          ) {
            target = candidateTarget
            break
          }
        }
      }

      // 3. Fallback heuristic detection if not over a registered zone
      if (!target) {
        target = { type: 'canvas', x, y }
      }
    }

    this.state = {
      ...this.state,
      currentPos: { x, y },
      dropTarget: target,
    }
    this.notify()
  }

  public endDrag(): { item: DraggedItem; dropTarget: DropTarget } | null {
    if (!this.state.isDragging || !this.state.item) {
      this.cancelDrag()
      return null
    }

    const result = {
      item: this.state.item,
      dropTarget: this.state.dropTarget || {
        type: 'canvas' as const,
        x: this.state.currentPos.x,
        y: this.state.currentPos.y,
      },
    }

    this.cancelDrag()
    return result
  }

  public cancelDrag() {
    this.state = {
      isDragging: false,
      item: null,
      currentPos: { x: 0, y: 0 },
      dropTarget: null,
    }
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    this.notify()
  }

  public getState(): DragState {
    return this.state
  }
}

export const dockDragManager = new DockDragManager()
