/**
 * CarGraphic: phần hình của xe.
 *
 * - Ô hàng là node thật `Body/Cargo/Slot0..N` (thấy và chỉnh được trong Hierarchy, được lưu vào prefab/scene).
 *   Khi `capacity` hoặc thông số thùng xe đổi, các ô được dàn đều lại từ `bedCabX` (sát đầu xe) tới `bedRearX`
 *   (đuôi xe); ngoài lúc đó, vị trí/kích thước bạn chỉnh tay trên từng ô được giữ nguyên.
 * - Ô thừa (khi giảm capacity) chỉ bị tắt chứ không xoá, vì không xoá được node con của prefab trong instance.
 * - Hàm: `refresh(colors, capacity)` vẽ lại hàng, `closeCover(done)` kéo mái che từ đầu xe ra đuôi (mask), `punch()` nảy nhẹ khi nhận khối,
 *   `showCheck()` hiện dấu tick, `hitTest()` kiểm tra điểm chạm có trúng xe không.
 */
import { _decorator, CCObject, Component, Mask, Node, Sprite, tween, UITransform, v3, Vec2 } from 'cc';
import { EDITOR } from 'cc/env';
import { ColorType } from '../Data';
import { CarSkin } from './CarSkin';
import { CarMovement } from './CarMovement';
const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('CarGraphic')
@executeInEditMode
export class CarGraphic extends Component {

    @property({ type: Sprite, tooltip: 'Sprite thân xe' })
    body: Sprite = null!;
    @property({ type: Node, tooltip: 'Node dấu tick đánh dấu xe hoàn thành' })
    checkmark: Node = null!;

    // Vùng chứa hàng của thùng xe theo tọa độ Body (đầu xe bên trái); tự đối xứng khi đầu xe bên phải
    @property({ tooltip: 'Tọa độ X mép thùng xe sát đầu xe' })
    bedCabX: number = -205;
    @property({ tooltip: 'Tọa độ X mép thùng xe ở đuôi xe' })
    bedRearX: number = 273;
    @property({ tooltip: 'Tọa độ Y của các ô hàng' })
    bedY: number = 44;
    @property({ tooltip: 'Khoảng cách giữa hai khối hàng liền kề' })
    gap: number = 3;
    @property({ tooltip: 'Chiều cao của một ô hàng' })
    slotHeight: number = 174;
    @property({ tooltip: 'Thời gian (giây) kéo mái che phủ kín thùng xe' })
    coverDuration: number = 0.45;

    // Thông số của lần dàn ô gần nhất; chỉ dàn lại khi thông số này thay đổi
    @property({ visible: false })
    layoutKey: string = '';

    skin: CarSkin = null!;
    slots: Sprite[] = [];
    previewKey: string = '';

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
        if (!relayout) return;
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

    refresh(colors: ColorType[], capacity: number) {
        if (!this.skin) return;
        this.build(capacity);
        this.body.spriteFrame = this.skin.emptyFrame;
        this.slots.forEach((sprite, i) => {
            let frame = i < colors.length ? this.skin.getUnit(colors[i]) : null;
            sprite.node.active = !!frame;
            if (frame) sprite.spriteFrame = frame;
        });
    }

    // Mái che trượt trên thùng xe từ đầu tới đuôi: sprite xe đóng nắp dần lộ ra qua mask mở rộng
    closeCover(done?: () => void) {
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
                this.punch();
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

    hitTest(screenPos: Vec2): boolean {
        return this.body.getComponent(UITransform).hitTest(screenPos);
    }

    // Chỉ dùng trong editor: vẽ lại hàng hóa mỗi khi colors / capacity / facing thay đổi trong Inspector
    update() {
        if (!EDITOR) return;
        let car: any = this.getComponent('CarController');
        if (!car || !this.body) return;
        if (!this.skin) this.onLoad();
        let key = JSON.stringify(car.colors) + this.getLayoutKey(car.capacity);
        if (key == this.previewKey) return;
        this.previewKey = key;
        this.refresh(car.colors, car.capacity);
    }
}
