import { APISocket, ContextMenuItem, EntityId, ContextMenu } from './types/index.js';
export declare const addContextMenuItems: <IdT, EntityIdT extends EntityId | undefined = undefined>(socket: APISocket, menuItems: ContextMenuItem<IdT, EntityIdT>[], menuTypeId: string, menu: ContextMenu) => Promise<() => Promise<void>>;
