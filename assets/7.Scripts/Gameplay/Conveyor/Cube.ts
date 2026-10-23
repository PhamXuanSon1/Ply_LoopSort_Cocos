/**
 * Cube: một cục hàng nhỏ (prefab `Cube`), giống cục trong game gốc: khối bo tròn có mặt trên sáng, mặt trước tối,
 * dải sáng ở mép và bóng đổ mềm.
 *
 * - Cấu trúc prefab: `Shadow` (bóng đổ, lệch xuống dưới) → `Body` (ảnh xám, tô màu bằng Sprite.color) → `Shine` (ánh sáng trắng, không tô màu).
 * - `palette`: màu tô cho từng ColorType (sáng hơn màu khối một chút vì mặt trước của ảnh Body tối hơn).
 * - `setColor(color)`: đổi màu cục. Conveyor tạo / tái sử dụng prefab này cho mọi cục trên băng.
 */
import { _decorator, Color, Component, Enum, Node, Sprite } from 'cc';
import { ColorType } from '../Data';
const { ccclass, property } = _decorator;

@ccclass('CubeTint')
export class CubeTint {
    @property({ type: Enum(ColorType), tooltip: 'Loại màu của cục' })
    color: ColorType = ColorType.Red;
    @property({ tooltip: 'Màu tô lên ảnh Body (mặt trên của cục có đúng màu này)' })
    tint: Color = new Color(255, 255, 255, 255);
}

@ccclass('Cube')
export class Cube extends Component {
    @property({ type: Sprite, tooltip: 'Thân cục (ảnh xám, được tô màu)' })
    body: Sprite = null!;
    @property({ type: Sprite, tooltip: 'Lớp ánh sáng trắng phủ trên thân cục' })
    shine: Sprite = null!;
    @property({ type: Node, tooltip: 'Bóng đổ dưới cục; ẩn khi cục đã nằm trong thùng xe' })
    shadow: Node = null!;
    @property({ type: [CubeTint], tooltip: 'Màu tô cho từng loại màu' })
    palette: CubeTint[] = [];

    color: ColorType = ColorType.Red;

    setColor(color: ColorType) {
        this.color = color;
        let entry = this.palette.find(p => p.color == color);
        if (this.body) this.body.color = entry ? entry.tint : Color.WHITE;
    }

    // Bóng đổ chỉ hiện khi cục đang rơi / chạy trên băng
    setShadow(visible: boolean) {
        if (this.shadow) this.shadow.active = visible;
    }
}
