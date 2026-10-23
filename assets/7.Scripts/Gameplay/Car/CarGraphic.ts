/**
 * CarGraphic: phần hình của xe.
 *
 * - Tự tạo `capacity` ô hàng (node ẩn `Slot0..N`, không lưu vào scene) chia đều trên thùng xe,
 *   từ `bedCabX` (sát đầu xe) tới `bedRearX` (đuôi xe); xem trước được ngay trong editor.
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

    @property(Sprite)
    body: Sprite = null!;
    @property(Node)
    checkmark: Node = null!;

    // cargo area of the truck bed in Body local space (cab on the left); mirrored when the cab is on the right
    @property({ tooltip: 'x of the bed edge next to the cab' })
    bedCabX: number = -205;
    @property({ tooltip: 'x of the bed edge at the rear' })
    bedRearX: number = 273;
    @property
    bedY: number = 44;
    @property({ tooltip: 'space between two cargo units' })
    gap: number = 3;
    @property({ tooltip: 'seconds for the roof to slide over the bed' })
    coverDuration: number = 0.45;

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

    // one sprite per slot, spread evenly over the bed; slot 0 is next to the cab
    build(capacity: number) {
        this.slots.forEach(s => s.node.destroy());
        this.slots = [];
        let sign = this.cabOnLeft ? 1 : -1;
        let cab = this.bedCabX * sign, rear = this.bedRearX * sign;
        let pitch = (rear - cab) / capacity;
        for (let i = 0; i < capacity; i++) {
            let node = new Node('Slot' + i);
            node._objFlags |= CCObject.Flags.DontSave | CCObject.Flags.HideInHierarchy;
            node.layer = this.body.node.layer;
            node.parent = this.body.node;
            node.setPosition(cab + pitch * (i + 0.5), this.bedY, 0);
            node.addComponent(UITransform);
            let sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.trim = false;
            node.active = false;
            this.slots.push(sprite);
        }
    }

    refresh(colors: ColorType[], capacity: number) {
        if (!this.skin) return;
        if (this.slots.length != capacity) this.build(capacity);
        this.body.spriteFrame = this.skin.emptyFrame;
        let width = Math.abs(this.bedRearX - this.bedCabX) / capacity - this.gap;
        this.slots.forEach((sprite, i) => {
            let frame = i < colors.length ? this.skin.getUnit(colors[i]) : null;
            sprite.node.active = !!frame;
            if (!frame) return;
            sprite.spriteFrame = frame;
            sprite.getComponent(UITransform).setContentSize(width, frame.originalSize.height);
        });
    }

    // roof slides over the bed from the cab to the rear: the closed-truck sprite is revealed by a growing mask
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

    // editor only: redraw the cargo whenever colors / capacity / facing change in the Inspector
    update() {
        if (!EDITOR) return;
        let car: any = this.getComponent('CarController');
        if (!car || !this.body) return;
        if (!this.skin) this.onLoad();
        let key = JSON.stringify([car.colors, car.capacity, this.cabOnLeft, this.bedCabX, this.bedRearX, this.bedY, this.gap]);
        if (key == this.previewKey) return;
        this.previewKey = key;
        this.build(car.capacity);
        this.refresh(car.colors, car.capacity);
    }
}
