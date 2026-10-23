/**
 * CarController: logic của một xe.
 *
 * - Dữ liệu `colors`: danh sách màu từ đầu xe tới đuôi; phần tử cuối là khối nằm trên cùng, ra trước. Sức chứa `capacity` (mặc định 4, chỉnh được trong Inspector).
 * - Trạng thái: `Idle` (đứng yên), `Unloading` (đang đổ hàng), `Complete` (đã đủ hàng).
 * - Hàm chính:
 *   - `onTap()`: xử lý khi xe bị chạm.
 *   - `canReceive(color)`: kiểm tra xe có nhận được khối màu này không.
 *   - `receive(color, delay)`: cho khối vào xe (giữ chỗ ngay, khối bật vào sau `delay` giây).
 *   - `reserve(color)` + `land(index, color)`: giữ chỗ trước rồi cho khối vào sau (băng chuyền dùng khi khối còn đang bay tới).
 *   - `complete()`: xe đủ `capacity` khối cùng màu: kéo mái che, hiện tick, xe đứng yên.
 *   - `checkWin()`: kiểm tra thắng.
 * - Sự kiện `carEvents`: phát `'unload'` (car, units, topIndex) khi xe đổ hàng và `'complete'` khi xe đủ hàng.
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

// 'unload' (car, colors[], topIndex) khi xe dỡ các khối trên cùng (topIndex = ô của khối ra đầu tiên), 'complete' (car) khi xe chứa đủ hàng cùng một màu
export const carEvents = new EventTarget();

@ccclass('CarController')
export class CarController extends Component {

    // Danh sách tất cả các xe trong scene; dùng để tìm xe nhận hàng khi chưa có băng chuyền
    static all: CarController[] = [];
    // Số khối đang chạy trên băng chuyền (chưa vào xe nào); còn khối thì chưa tính thắng
    static unitsOnBelt: number = 0;

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

    // Xe đang chờ khối trên băng chuyền tới (ô đã giữ chỗ) thì chưa cho dỡ, tránh dỡ cả khối chưa về
    canTap(): boolean {
        return this.state == CarState.Idle && !this.isEmpty() && this.graphic.pending.size == 0;
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
            // Hệ thống băng chuyền sẽ tiếp nhận các khối từ đây; xe không nhận hàng cho tới khi dỡ xong
            let top = this.colors.length - 1;
            this.colors.length -= units.length;
            this.state = CarState.Unloading;
            this.movement.backUp();
            units.forEach((_, k) => this.scheduleOnce(() => this.graphic.slotOut(top - k), k * this.unloadInterval));
            this.scheduleOnce(() => {
                this.state = CarState.Idle;
                this.movement.settle();
            }, units.length * this.unloadInterval + 0.1);
            carEvents.emit('unload', this, units, top);
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
        // Xe lùi lại để đuôi xe sát băng chuyền rồi mới bắt đầu dỡ
        this.movement.backUp();
        let step = (i: number) => {
            let target = CarController.findReceiver(color, this);
            if (i >= count || !target || this.topColor != color) {
                this.state = CarState.Idle;
                this.movement.settle();
                return;
            }
            this.colors.pop();
            this.graphic.slotOut(this.colors.length);
            // Xe nhận giữ chỗ ngay, khối chỉ hiện ở xe nhận khi khối ở xe này đã trượt ra xong
            target.receive(color, this.graphic.slotAnimDuration);
            this.scheduleOnce(() => step(i + 1), this.unloadInterval);
        };
        this.scheduleOnce(() => step(0), this.movement.backDuration);
    }

    // Nhận một khối; delay > 0 thì ô được giữ chỗ ngay (logic đã tính khối này) nhưng khối hiện sau `delay` giây
    receive(color: ColorType, delay: number = 0) {
        let index = this.reserve(color);
        if (delay > 0) this.scheduleOnce(() => this.land(index, color), delay);
        else this.land(index, color);
    }

    // Giữ chỗ một khối (logic tính khối này ngay, ô bị ẩn); trả về chỉ số ô, gọi land(index, color) khi khối tới nơi
    reserve(color: ColorType): number {
        this.colors.push(color);
        let index = this.colors.length - 1;
        this.graphic.reserve(index);
        this.graphic.refresh(this.colors, this.capacity);
        return index;
    }

    // Khối vào hẳn thùng xe: chỉ khối mới bật vào (thân xe đứng yên); đủ hàng cùng màu thì hoàn thành
    land(index: number, color: ColorType) {
        this.graphic.slotIn(index);
        sm?.playSound(SoundType.Match);
        if (this.state != CarState.Complete && this.graphic.pending.size == 0 &&
            this.colors.length >= this.capacity && this.colors.every(c => c == color)) {
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
        if (CarController.unitsOnBelt > 0) return;
        if (cars.some(c => c.state == CarState.Unloading)) return;
        if (cars.every(c => c.isComplete() || c.isEmpty())) {
            ui?.onWin();
        }
    }
}
