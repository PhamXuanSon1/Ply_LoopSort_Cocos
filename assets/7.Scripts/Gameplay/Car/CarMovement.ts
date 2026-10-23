/**
 * CarMovement: chuyển động của xe.
 *
 * - `shake()`: rung khi chạm vào xe không đổ hàng được.
 * - `backUp()`: lùi về phía băng chuyền (đuôi xe lại gần băng) và giữ nguyên trong lúc đổ hàng; `settle()` về lại chỗ cũ.
 * - `driveAway()`: chạy ra khỏi màn hình về phía đầu xe (hiện không dùng: xe hoàn thành thì đứng yên).
 */
import { _decorator, Component, Tween, tween, v3, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CarMovement')
export class CarMovement extends Component {

    // -1 = đầu xe hướng sang trái (đuôi quay về băng chuyền bên phải), 1 = đầu xe hướng sang phải
    @property({ tooltip: 'Hướng đầu xe: -1 là quay trái (đuôi hướng về băng chuyền bên phải), 1 là quay phải' })
    facing: number = -1;
    @property({ tooltip: 'Khoảng cách (pixel) xe lùi về phía băng chuyền khi đổ hàng' })
    backDistance: number = 30;
    @property({ tooltip: 'Thời gian (giây) xe lùi về phía băng chuyền' })
    backDuration: number = 0.15;
    @property({ tooltip: 'Khoảng cách (pixel) xe chạy ra ngoài màn hình' })
    driveDistance: number = 1600;
    @property({ tooltip: 'Thời gian (giây) xe chạy ra ngoài màn hình' })
    driveDuration: number = 0.7;

    origin: Vec3 = null!;

    onLoad() {
        this.origin = this.node.position.clone();
    }

    // Rung lắc khi chạm vào xe không thể dỡ hàng
    shake() {
        Tween.stopAllByTarget(this.node);
        this.node.setPosition(this.origin);
        let o = this.origin;
        tween(this.node)
            .to(0.05, { position: v3(o.x - 14, o.y, o.z) })
            .to(0.05, { position: v3(o.x + 14, o.y, o.z) })
            .to(0.05, { position: v3(o.x - 8, o.y, o.z) })
            .to(0.05, { position: v3(o.x, o.y, o.z) })
            .start();
    }

    // Lùi về phía băng chuyền (ngược hướng đầu xe) và đứng đó trong lúc dỡ hàng
    backUp() {
        Tween.stopAllByTarget(this.node);
        let o = this.origin;
        tween(this.node)
            .to(this.backDuration, { position: v3(o.x - this.facing * this.backDistance, o.y, o.z) }, { easing: 'quadOut' })
            .start();
    }

    // Dỡ hàng xong: chạy về lại vị trí ban đầu
    settle() {
        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(0.2, { position: this.origin }, { easing: 'quadInOut' })
            .start();
    }

    // Chạy ra ngoài màn hình về phía đầu xe, sau đó ẩn đi
    driveAway(done?: () => void) {
        Tween.stopAllByTarget(this.node);
        let o = this.origin;
        tween(this.node)
            .delay(0.35)
            .to(0.12, { position: v3(o.x - this.facing * 20, o.y, o.z) }, { easing: 'quadOut' })
            .to(this.driveDuration, { position: v3(o.x + this.facing * this.driveDistance, o.y, o.z) }, { easing: 'quadIn' })
            .call(() => {
                this.node.active = false;
                done && done();
            })
            .start();
    }
}
