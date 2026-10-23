/**
 * CarGraphic: phần hình của xe.
 *
 * - Ô hàng là node thật `Body/Cargo/Slot0..N` (thấy và chỉnh được trong Hierarchy, được lưu vào prefab/scene).
 *   Khi `capacity` hoặc thông số thùng xe đổi, các ô được dàn đều lại từ `bedCabX` (sát đầu xe) tới `bedRearX`
 *   (đuôi xe); ngoài lúc đó, vị trí/kích thước bạn chỉnh tay trên từng ô được giữ nguyên.
 * - Ô thừa (khi giảm capacity) chỉ bị tắt chứ không xoá, vì không xoá được node con của prefab trong instance.
 * - Ảnh khối không có viền; viền đen là node `Body/Cargo/Outline` (9-slice) chỉ bao quanh nhóm khối cùng màu
 *   nằm trên cùng, được ẩn khi khối đang bay ra / vào và vẽ lại khi anim xong (`updateOutline()`).
 * - Hàm: `refresh(colors, capacity)` vẽ lại hàng, `slotOut(i)` khối trượt ra phía đuôi xe rồi biến mất,
 *   `slotIn(i)` khối bật vào từ phía đuôi xe, `closeCover(done)` kéo mái che từ đầu xe ra đuôi (mask),
 *   `punch()` nảy nhẹ thân xe (hiện không dùng: thân xe đứng yên khi nhận khối), `showCheck()` hiện dấu tick, `hitTest()` kiểm tra điểm chạm có trúng xe không.
 */
import { _decorator, CCObject, Component, Mask, Node, Sprite, Tween, tween, UITransform, v3, Vec2, Vec3 } from 'cc';
import { EDITOR } from 'cc/env';
import { ColorType } from '../Data';
import { CarSkin } from './CarSkin';
import { CarMovement } from './CarMovement';
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('CarGraphic')
@executeInEditMode
export class CarGraphic extends Component {

    // =========================================================================
    // 1. THUỘC TÍNH INSPECTOR (PROPERTIES)
    // =========================================================================

    // ---------- Tham chiếu Node / Sprite ----------
    @property({ group: { name: 'Tham Chiếu', id: 'ref', displayOrder: 0 }, type: Sprite, tooltip: 'Sprite thân xe' })
    body: Sprite = null!;

    @property({ group: { name: 'Tham Chiếu', id: 'ref', displayOrder: 0 }, type: Node, tooltip: 'Node dấu tick đánh dấu xe hoàn thành' })
    checkmark: Node = null!;

    // ---------- Kích thước & Tọa độ thùng xe ----------
    // Vùng chứa hàng của thùng xe theo tọa độ Body (đầu xe bên trái); tự đối xứng khi đầu xe bên phải
    @property({ group: { name: 'Thông Số Thùng Xe', id: 'layout', displayOrder: 1 }, tooltip: 'Tọa độ X mép thùng xe sát đầu xe' })
    bedCabX: number = -205;

    @property({ group: { name: 'Thông Số Thùng Xe', id: 'layout', displayOrder: 1 }, tooltip: 'Tọa độ X mép thùng xe ở đuôi xe' })
    bedRearX: number = 273;

    @property({ group: { name: 'Thông Số Thùng Xe', id: 'layout', displayOrder: 1 }, tooltip: 'Tọa độ Y của các ô hàng' })
    bedY: number = 44;

    @property({ group: { name: 'Thông Số Thùng Xe', id: 'layout', displayOrder: 1 }, tooltip: 'Khoảng cách giữa hai khối hàng liền kề' })
    gap: number = 3;

    @property({ group: { name: 'Thông Số Thùng Xe', id: 'layout', displayOrder: 1 }, tooltip: 'Chiều cao của một ô hàng' })
    slotHeight: number = 174;

    // ---------- Cấu hình Hiệu ứng (Animations) ----------
    @property({ group: { name: 'Hiệu Ứng', id: 'anim', displayOrder: 2 }, tooltip: 'Thời gian (giây) kéo mái che phủ kín thùng xe' })
    coverDuration: number = 0.45;

    @property({ group: { name: 'Hiệu Ứng', id: 'anim', displayOrder: 2 }, tooltip: 'Thời gian (giây) một khối trượt ra / bật vào thùng xe' })
    slotAnimDuration: number = 0.18;

    @property({ group: { name: 'Hiệu Ứng', id: 'anim', displayOrder: 2 }, tooltip: 'Quãng đường (pixel) khối trượt về phía đuôi xe khi ra / vào' })
    slotAnimDistance: number = 70;

    // Thông số của lần dàn ô gần nhất; chỉ dàn lại khi thông số này thay đổi
    @property({ visible: false })
    layoutKey: string = '';

    // =========================================================================
    // 2. TRẠNG THÁI NỘI BỘ (INTERNAL STATE)
    // =========================================================================

    skin: CarSkin = null!;
    slots: Sprite[] = [];
    // Mảng màu của xe (cùng tham chiếu với CarController.colors) để vẽ lại viền khi khối ra / vào
    colors: ColorType[] = [];
    // Vị trí gốc của từng ô (để trả ô về chỗ sau khi chạy anim)
    homes: Vec3[] = [];
    // Mái che đã đóng (xe hoàn thành): không vẽ viền nữa
    closed: boolean = false;
    // Ô đã được giữ chỗ cho khối đang trên đường tới (chưa hiện cho tới khi slotIn)
    pending: Set<number> = new Set();
    previewKey: string = '';

    // =========================================================================
    // 3. VÒNG ĐỜI & KHỞI TẠO (LIFECYCLE & GETTERS)
    // =========================================================================

    onLoad() {
        this.skin = this.getComponent(CarSkin) || this.node.parent?.getComponent(CarSkin);
    }

    get cabOnLeft(): boolean {
        let movement = this.getComponent(CarMovement);
        return !movement || movement.facing < 0;
    }

    // Node chứa các ô hàng (Body/Cargo); tạo mới nếu chưa có
    get cargoRoot(): Node {
        let root = this.body.node.getChildByName('Cargo');
        if (!root) {
            root = new Node('Cargo');
            root.layer = this.body.node.layer;
            root.parent = this.body.node;
            root.addComponent(UITransform);
        }
        return root;
    }

    // =========================================================================
    // 4. DÀN Ô HÀNG TRÊN THÙNG XE (SLOT LAYOUT & HIERARCHY)
    // =========================================================================

    getLayoutKey(capacity: number): string {
        return JSON.stringify([capacity, this.cabOnLeft, this.bedCabX, this.bedRearX, this.bedY, this.gap, this.slotHeight]);
    }

    // Lấy các ô Slot0..SlotN có sẵn, tạo thêm nếu thiếu; chỉ dàn đều lại khi capacity/thông số thùng xe đổi
    build(capacity: number) {
        let root = this.cargoRoot;
        let key = this.getLayoutKey(capacity);
        let relayout = key != this.layoutKey;
        this.slots = [];
        for (let i = 0; i < Math.max(capacity, root.children.length); i++) {
            let node = root.getChildByName('Slot' + i);
            if (!node) {
                if (i >= capacity) continue;
                node = new Node('Slot' + i);
                node.layer = root.layer;
                node.parent = root;
                node.addComponent(UITransform);
                let s = node.addComponent(Sprite);
                s.sizeMode = Sprite.SizeMode.CUSTOM;
                s.trim = false;
                relayout = true;
            }
            if (i >= capacity) {
                node.active = false;
                continue;
            }
            this.slots.push(node.getComponent(Sprite));
        }
        if (relayout) this.layout(capacity, key);
        // Chỉ ghi nhận vị trí gốc khi vừa dàn ô hoặc lần đầu; không lấy lại giữa chừng vì ô có thể đang bay (lệch chỗ)
        if (relayout || this.homes.length != this.slots.length) {
            this.homes = this.slots.map(s => s.node.position.clone());
        }
    }

    // Dàn đều các ô từ mép thùng sát đầu xe tới mép thùng ở đuôi xe
    layout(capacity: number, key: string) {
        this.layoutKey = key;
        let sign = this.cabOnLeft ? 1 : -1;
        let cab = this.bedCabX * sign, rear = this.bedRearX * sign;
        let pitch = (rear - cab) / capacity;
        let width = Math.abs(pitch) - this.gap;
        this.slots.forEach((sprite, i) => {
            sprite.node.setPosition(cab + pitch * (i + 0.5), this.bedY, 0);
            sprite.getComponent(UITransform).setContentSize(width, this.slotHeight);
        });
    }

    // =========================================================================
    // 5. HIỂN THỊ & VẼ LẠI HÀNG HÓA (REFRESH & RENDER)
    // =========================================================================

    refresh(colors: ColorType[], capacity: number) {
        if (!this.skin) return;
        this.colors = colors;
        this.closed = false;
        this.build(capacity);
        this.body.spriteFrame = this.skin.emptyFrame;
        this.slots.forEach((sprite, i) => {
            let frame = i < colors.length ? this.skin.getUnit(colors[i]) : null;
            if (!EDITOR) this.resetSlot(i);
            sprite.node.active = !!frame && !this.pending.has(i);
            if (frame) sprite.spriteFrame = frame;
        });
        this.updateOutline();
    }

    resetSlot(i: number) {
        let node = this.slots[i]?.node;
        if (!node || !this.homes[i]) return;
        Tween.stopAllByTarget(node);
        node.setPosition(this.homes[i]);
        node.setScale(1, 1, 1);
    }

    // =========================================================================
    // 6. VIỀN NHÓM KHỐI HÀNG (OUTLINE 9-SLICE)
    // =========================================================================

    // Node viền đen Body/Cargo/Outline, luôn vẽ trên các ô hàng; tạo mới nếu chưa có
    get outline(): Sprite {
        let root = this.cargoRoot;
        let node = root.getChildByName('Outline');
        if (!node) {
            node = new Node('Outline');
            node.layer = root.layer;
            node.parent = root;
            node.addComponent(UITransform);
            let s = node.addComponent(Sprite);
            s.type = Sprite.Type.SLICED;
            s.sizeMode = Sprite.SizeMode.CUSTOM;
            s.trim = false;
        }
        node.setSiblingIndex(root.children.length - 1);
        return node.getComponent(Sprite);
    }

    hideOutline() {
        let node = this.cargoRoot.getChildByName('Outline');
        if (node) node.active = false;
    }

    // Viền đen chỉ bao quanh nhóm khối cùng màu nằm trên cùng (nhóm sẽ dỡ ra khi chạm), các khối khác không có viền
    updateOutline() {
        let colors = this.colors;
        if (this.closed || this.pending.size > 0 || !this.skin?.outlineFrame || colors.length == 0 || colors.length > this.slots.length) {
            this.hideOutline();
            return;
        }
        let top = colors.length - 1, from = top;
        while (from > 0 && colors[from - 1] == colors[top]) from--;
        let min = Infinity, max = -Infinity, y = 0, height = 0;
        for (let i = from; i <= top; i++) {
            let size = this.slots[i].getComponent(UITransform).contentSize;
            let home = this.homes[i];
            min = Math.min(min, home.x - size.width / 2);
            max = Math.max(max, home.x + size.width / 2);
            y = home.y;
            height = size.height;
        }
        let sprite = this.outline;
        sprite.spriteFrame = this.skin.outlineFrame;
        sprite.node.active = true;
        sprite.node.setPosition((min + max) / 2, y, 0);
        sprite.getComponent(UITransform).setContentSize(max - min, height);
    }

    // =========================================================================
    // 7. HIỆU ỨNG KHỐI HÀNG RA / VÀO (SLOT ANIMATIONS)
    // =========================================================================

    // Hướng từ đầu xe ra đuôi xe trên trục X (+1 khi đầu xe bên trái)
    get rearDir(): number {
        return this.cabOnLeft ? 1 : -1;
    }

    // Khối ở ô i trượt ra phía đuôi xe (về phía băng chuyền), thu nhỏ rồi tắt
    slotOut(i: number, done?: () => void) {
        let node = this.slots[i]?.node;
        if (!node) { done && done(); return; }
        this.resetSlot(i);
        this.hideOutline();
        let home = this.homes[i];
        tween(node)
            .to(this.slotAnimDuration, { position: v3(home.x + this.rearDir * this.slotAnimDistance, home.y, home.z), scale: v3(0.4, 0.4, 1) }, { easing: 'quadIn' })
            .call(() => {
                node.active = false;
                this.resetSlot(i);
                this.updateOutline();
                done && done();
            })
            .start();
    }

    // Giữ chỗ ô i cho khối đang tới: ô bị ẩn cho tới khi slotIn(i)
    reserve(i: number) {
        this.pending.add(i);
        let node = this.slots[i]?.node;
        if (node) node.active = false;
        this.hideOutline();
    }

    // Khối ở ô i trượt vào từ phía đuôi xe và dừng đúng kích thước, đúng chỗ (không phóng quá cỡ để không đè ô bên cạnh)
    slotIn(i: number) {
        this.pending.delete(i);
        let node = this.slots[i]?.node;
        if (!node) return;
        this.resetSlot(i);
        let home = this.homes[i];
        node.active = true;
        node.setPosition(home.x + this.rearDir * this.slotAnimDistance, home.y, home.z);
        node.setScale(0.4, 0.4, 1);
        this.hideOutline();
        tween(node)
            .to(this.slotAnimDuration, { position: home, scale: v3(1, 1, 1) }, { easing: 'quadOut' })
            .call(() => {
                this.resetSlot(i);
                this.updateOutline();
            })
            .start();
    }

    // =========================================================================
    // 8. HIỆU ỨNG XE HOÀN THÀNH (COMPLETE & FX)
    // =========================================================================

    // Mái che trượt trên thùng xe từ đầu tới đuôi: sprite xe đóng nắp dần lộ ra qua mask mở rộng
    closeCover(done?: () => void) {
        // Chặn mọi lần vẽ lại viền còn chờ (vd. anim slotIn của khối cuối) để viền không hiện đè lên mái
        this.closed = true;
        this.hideOutline();
        let size = this.body.getComponent(UITransform).contentSize;
        let fromLeft = this.cabOnLeft;
        let mask = new Node('CoverMask');
        mask._objFlags |= CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
        mask.layer = this.body.node.layer;
        mask.parent = this.body.node;
        mask.setPosition(fromLeft ? -size.width / 2 : size.width / 2, 0, 0);
        let maskTransform = mask.addComponent(UITransform);
        maskTransform.setAnchorPoint(fromLeft ? 0 : 1, 0.5);
        maskTransform.setContentSize(0, size.height);
        mask.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;

        let cover = new Node('Cover');
        cover.layer = mask.layer;
        cover.parent = mask;
        cover.setPosition(fromLeft ? size.width / 2 : -size.width / 2, 0, 0);
        cover.addComponent(UITransform).setContentSize(size);
        let sprite = cover.addComponent(Sprite);
        sprite.trim = false;
        sprite.sizeMode = Sprite.SizeMode.RAW;
        sprite.spriteFrame = this.skin.closedFrame;

        let state = { width: 0 };
        tween(state)
            .to(this.coverDuration, { width: size.width }, {
                easing: 'quadInOut',
                onUpdate: () => maskTransform.setContentSize(state.width, size.height),
            })
            .call(() => {
                this.body.spriteFrame = this.skin.closedFrame;
                this.slots.forEach(s => s.node.active = false);
                mask.destroy();
                done && done();
            })
            .start();
    }

    punch() {
        let node = this.body.node;
        tween(node).stop();
        node.setScale(1, 1, 1);
        tween(node)
            .to(0.08, { scale: v3(1.06, 0.94, 1) }, { easing: 'quadOut' })
            .to(0.12, { scale: v3(1, 1, 1) }, { easing: 'backOut' })
            .start();
    }

    showCheck() {
        if (!this.checkmark) return;
        let base = this.checkmark.scale.clone();
        this.checkmark.active = true;
        this.checkmark.setScale(0, 0, 1);
        tween(this.checkmark).to(0.25, { scale: base }, { easing: 'backOut' }).start();
    }

    // =========================================================================
    // 9. TƯƠNG TÁC & XEM TRƯỚC TRONG EDITOR (INTERACTION & PREVIEW)
    // =========================================================================

    hitTest(screenPos: Vec2): boolean {
        return this.body.getComponent(UITransform).hitTest(screenPos);
    }

    // Chỉ dùng trong editor: vẽ lại hàng hóa mỗi khi colors / capacity / facing thay đổi trong Inspector
    update() {
        if (!EDITOR) return;
        let car: any = this.getComponent('CarController');
        if (!car || !this.body) return;
        if (!this.skin) this.onLoad();
        let key = JSON.stringify(car.colors) + this.getLayoutKey(car.capacity) + (this.skin?.outlineFrame?.uuid || '');
        if (key == this.previewKey) return;
        this.previewKey = key;
        this.refresh(car.colors, car.capacity);
    }
}
