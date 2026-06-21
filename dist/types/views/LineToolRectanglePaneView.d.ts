/**
 * The PaneView for the Rectangle line tool.
 * It prepares the data for the generic RectangleRenderer, TextRenderer, and LineAnchorRenderer
 * based on the LineToolRectangle's state and options. It then combines these using
 * the CompositeRenderer from the core plugin to render the final tool on the chart.
 */
import { IChartApiBase, ISeriesApi, SeriesType } from 'lightweight-charts';
import { CompositeRenderer, LineToolPaneView } from 'lightweight-charts-line-tools-core';
import { LineToolRectangle } from '../model/LineToolRectangle';
/**
 * The specific Pane View for the Rectangle tool.
 *
 * **Tutorial Note:**
 * In the Lightweight Charts Line Tools architecture (MVC), this class acts as the **View**.
 *
 * **Responsibilities:**
 * 1. **Bridge:** It sits between the **Model** (`LineToolRectangle`) and the **Rendering Engine** (`CompositeRenderer`).
 * 2. **Translation:** It converts the Model's abstract logical points (Time/Price) into concrete screen coordinates (Pixels).
 * 3. **Composition:** It decides *what* to draw. For a rectangle, it instantiates and configures:
 *    - A `RectangleRenderer` (for the background and borders).
 *    - A `TextRenderer` (for the label).
 *    - A `LineAnchorRenderer` (via the base class) for the 8 resize handles.
 * 4. **Optimization:** It implements specific **Culling Logic** to prevent rendering when the tool is off-screen.
 */
export declare class LineToolRectanglePaneView<HorzScaleItem> extends LineToolPaneView<HorzScaleItem> {
    /**
     * Initializes the View instance.
     *
     * **Tutorial Note:**
     * The constructor receives the specific `LineToolRectangle` instance.
     * By passing this specific type (instead of the generic `BaseLineTool`), we gain type safety
     * when accessing rectangle-specific options (like `options.rectangle.extend`) later in the render loop.
     *
     * We pass these references up to the `super()` constructor, which initializes the shared
     * `CompositeRenderer`, `RectangleRenderer`, and `TextRenderer` instances automatically.
     *
     * @param source - The concrete Model instance for this rectangle.
     * @param chart - The LWC Chart API (used for coordinate conversion).
     * @param series - The LWC Series API (used for price conversion).
     */
    constructor(source: LineToolRectangle<HorzScaleItem>, // Specific tool instance
    chart: IChartApiBase<any>, // Chart API
    series: ISeriesApi<SeriesType, any>);
    /**
     * The main rendering loop for this tool.
     *
     * **Tutorial Note:**
     * This method is called by the Core whenever the chart needs to paint (e.g., on scroll, zoom, or mouse move),
     * *but only if* `update()` has been called to mark the view as "invalidated".
     *
     * **The Render Lifecycle:**
     * 1. **Clear:** We wipe the `_renderer` clean. It's a fresh frame.
     * 2. **Check Visibility:** If the tool is hidden via options, we abort.
     * 3. **Update Points:** We call `_updatePoints()` (from Base) to convert Time/Price -> x/y pixels.
     * 4. **Culling:** We determine if the tool is actually visible in the viewport.
     * 5. **Populate:** If visible, we configure the `RectangleRenderer` and `TextRenderer` with the new
     *    coordinates and styles, then `append()` them to the `CompositeRenderer`.
     * 6. **Anchors:** We calculate and add the interaction handles.
     *
     * @override
     */
    protected _updateImpl(height: number, width: number): void;
    /**
     * Calculates and renders the interactive resize handles (anchors) for the rectangle.
     *
     * **Tutorial Note - Custom Anchor Logic:**
     * We override this method because a Rectangle has complex anchor requirements that the default logic doesn't handle:
     * 1. **8 Handles:** Corners (resize both dimensions) + Midpoints (resize width OR height).
     * 2. **Dynamic Cursors:** The cursor for the top-left corner depends on the rectangle's orientation.
     *    If the user dragged "up and left" vs "down and right", the diagonal resize direction flips (NWSE vs NESW).
     *
     * This method calculates the geometry for all 8 points, determines the correct cursor for the corners
     * based on sign of width/height, and registers them.
     *
     * @override
     */
    protected _addAnchors(renderer: CompositeRenderer<any>): void;
}
