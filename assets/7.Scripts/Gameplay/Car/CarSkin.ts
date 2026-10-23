/**
 * CarSkin: kho ảnh của xe (ảnh xe rỗng, xe đóng nắp, ảnh 1 khối hàng cho từng màu), gắn trên prefab `Truck`.
 *
 * - `units`: mỗi màu một ảnh khối (`LoopSort/CargoUnits/Left/<Màu>.png`); CarGraphic tự kéo giãn theo số ô.
 * - Nếu không có trên xe, CarGraphic tìm CarSkin ở node cha (dùng chung cho nhiều xe).
 * - Cocos chỉ cho mỗi file một component, nên lớp này phải nằm ở file riêng.
 */
import { _decorator, Component, Enum, SpriteFrame, ccenum } from 'cc';
import { ColorType } from '../Data';
const { ccclass, property } = _decorator;

ccenum(ColorType);

// Khối hàng hiển thị trên thùng xe (ảnh đã được cắt khớp với thành xe)
@ccclass('CargoUnitFrame')
export class CargoUnitFrame {
    @property({ type: Enum(ColorType), tooltip: 'Loại màu của khối hàng' })
    color: ColorType = ColorType.Red;
    @property({ type: SpriteFrame, tooltip: 'SpriteFrame tương ứng của khối hàng màu này' })
    frame: SpriteFrame = null!;
}

// Bộ sprite của xe; gắn trên chính xe (prefab) hoặc trên node cha để dùng chung giữa các xe
@ccclass('CarSkin')
export class CarSkin extends Component {
    @property({ type: SpriteFrame, tooltip: 'Ảnh xe khi thùng rỗng / đang mở nắp' })
    emptyFrame: SpriteFrame = null!;
    @property({ type: SpriteFrame, tooltip: 'Ảnh xe khi đã đóng mái che (hoàn thành)' })
    closedFrame: SpriteFrame = null!;
    @property({ type: [CargoUnitFrame], tooltip: 'Danh sách sprite khối hàng theo từng màu' })
    units: CargoUnitFrame[] = [];

    getUnit(color: ColorType): SpriteFrame {
        let unit = this.units.find(u => u.color == color);
        return unit ? unit.frame : null;
    }
}
