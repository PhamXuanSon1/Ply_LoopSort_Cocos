/**
 * CarController: logic của một xe.
 *
 * - Dữ liệu `colors`: danh sách màu từ đầu xe tới đuôi; phần tử cuối là khối nằm trên cùng, ra trước. Sức chứa `capacity` (mặc định 4, chỉnh được trong Inspector).
 * - Trạng thái: `Idle` (đứng yên), `Unloading` (đang đổ hàng), `Complete` (đã đủ hàng).
 * - Hàm chính:
 *   - `onTap()`: xử lý khi xe bị chạm.
 *   - `canReceive(color)`: kiểm tra xe có nhận được khối màu này không.
 *   - `receive(color)`: cho khối vào xe.
 *   - `complete()`: xe đủ `capacity` khối cùng màu: kéo mái che, hiện tick, xe đứng yên.
 *   - `checkWin()`: kiểm tra thắng.
 * - Sự kiện `carEvents`: phát `'unload'` khi xe đổ hàng và `'complete'` khi xe đủ hàng.
 * - Chuyển hàng trực tiếp (tạm thời): khi chưa có script nào nghe `'unload'`, khối được chuyển thẳng sang xe
 *   phù hợp nhất, ưu tiên xe đã có cùng màu trước, rồi mới tới xe rỗng. Đây là cách tạm để chơi được trong lúc
 *   chưa có băng chuyền. Khi viết băng chuyền, chỉ cần `carEvents.on('unload', ...)` là luồng này tự tắt.
 */
import { _decorator, Component, Enum, EventTarget, Vec2 } from 'cc';
import { ColorType } from '../Data';
import { CarGraphic } from './CarGraphic';
import { CarMovement } from './CarMovement';
import { sm, SoundType } from '../../Manager/SoundManager';
import { ui } from '../../Manager/UI';
const { ccclass, property } = _decorator;

export enum CarState {
    Idle,
    Unloading,
    Complete,
}

// 'unload' (car, colors[]) khi xe dỡ các khối trên cùng, 'complete' (car) khi xe chứa đủ hàng cùng một màu
export const carEvents = new EventTarget();

@ccclass('CarController')
export class CarController extends Component {

    static all: CarController[] = [];

    // Hàng hóa từ đầu xe (index 0) tới đuôi; phần tử cuối cùng là khối nằm trên cùng ra trước
    @property({ type: [Enum(ColorType)], tooltip: 'Danh sách màu hàng hóa từ đầu xe (index 0) tới đuôi; phần tử cuối nằm trên cùng sẽ dỡ ra trước' })
    colors: ColorType[] = [];
    // Số ô chứa hàng trên xe; phần hình ảnh sẽ chia đều các ô này trên thùng xe
    @property({ min: 1, step: 1, tooltip: 'Số ô chứa hàng tối đa trên xe' })
    capacity: number = 4;
    // Thời gian giãn cách (giây) giữa hai khối rời khỏi xe
    @property({ tooltip: 'Thời gian giãn cách (giây) giữa hai lần dỡ khối liên tiếp' })
    unloadInterval: number = 0.25;

    state: CarState = CarState.Idle;
    graphic: CarGraphic = null!;
    movement: CarMovement = null!;

    onLoad() {
        this.graphic = this.getComponent(CarGraphic);
        this.movement = this.getComponent(CarMovement);
        CarController.all.push(this);
    }

    onDestroy() {
        let i = CarController.all.indexOf(this);
        if (i >= 0) CarController.all.splice(i, 1);
    }

    start() {
        if (this.colors.length > this.capacity) {
            console.warn(`${this.node.name}: ${this.colors.length} colors but capacity ${this.capacity}`);
            this.colors.length = this.capacity;
        }
        this.graphic.refresh(this.colors, this.capacity);
    }

    get topColor(): ColorType {
        return this.colors[this.colors.length - 1];
    }

    isEmpty(): boolean {
        return this.colors.length == 0;
    }

    isComplete(): boolean {
        return this.state == CarState.Complete;
    }

    hitTest(screenPos: Vec2): boolean {
        return this.node.activeInHierarchy && this.graphic.hitTest(screenPos);
    }

    canTap(): boolean {
        return this.state == CarState.Idle && !this.isEmpty();
    }

    // Số lượng khối cùng màu nằm liên tiếp ở trên cùng
    topRunCount(): number {
        let n = 0;
        for (let i = this.colors.length - 1; i >= 0 && this.colors[i] == this.topColor; i--) n++;
        return n;
    }

    canReceive(color: ColorType): boolean {
        if (this.state == CarState.Complete || this.state == CarState.Unloading) return false;
        if (this.colors.length >= this.capacity) return false;
        return this.isEmpty() || this.topColor == color;
    }

    onTap() {
        if (!this.canTap()) {
            this.movement.shake();
            return;
        }
        let units = this.colors.slice(this.colors.length - this.topRunCount());
        sm?.playSound(SoundType.Touch);
        if (carEvents.hasEventListener('unload')) {
            // Hệ thống băng chuyền sẽ tiếp nhận các khối từ đây
            this.colors.length -= units.length;
            this.graphic.refresh(this.colors, this.capacity);
            this.movement.nudge();
            carEvents.emit('unload', this, units);
            return;
        }
        this.transferDirect(units.length);
    }

    // Tạm thời khi chưa có băng chuyền: chuyển các khối thẳng sang xe nhận phù hợp nhất
    transferDirect(count: number) {
        let color = this.topColor;
        if (!CarController.findReceiver(color, this)) {
            this.movement.shake();
            return;
        }
        this.state = CarState.Unloading;
        this.movement.nudge();
        let step = (i: number) => {
            let target = CarController.findReceiver(color, this);
            if (i >= count || !target || this.topColor != color) {
                this.state = CarState.Idle;
                return;
            }
            this.colors.pop();
            this.graphic.refresh(this.colors, this.capacity);
            target.receive(color);
            this.scheduleOnce(() => step(i + 1), this.unloadInterval);
        };
        step(0);
    }

    receive(color: ColorType) {
        this.colors.push(color);
        this.graphic.refresh(this.colors, this.capacity);
        this.graphic.punch();
        sm?.playSound(SoundType.Match);
        if (this.colors.length >= this.capacity && this.colors.every(c => c == color)) {
            this.complete();
        }
    }

    complete() {
        this.state = CarState.Complete;
        sm?.playSound(SoundType.Full);
        // Mái che đóng lại phủ lên thùng hàng, sau đó dấu tích hiện lên trên mái; xe đứng yên tại chỗ
        this.graphic.closeCover(() => {
            this.graphic.showCheck();
            this.scheduleOnce(() => CarController.checkWin(), 0.6);
        });
        carEvents.emit('complete', this);
    }

    // Xe đã có sẵn màu này được ưu tiên hơn xe rỗng
    static findReceiver(color: ColorType, except: CarController = null): CarController {
        let cars = CarController.all.filter(c => c != except && c.node.activeInHierarchy && c.canReceive(color));
        return cars.find(c => !c.isEmpty()) || cars[0] || null;
    }

    static checkWin() {
        let cars = CarController.all;
        if (cars.length == 0) return;
        if (cars.some(c => c.state == CarState.Unloading)) return;
        if (cars.every(c => c.isComplete() || c.isEmpty())) {
            ui?.onWin();
        }
    }
}
