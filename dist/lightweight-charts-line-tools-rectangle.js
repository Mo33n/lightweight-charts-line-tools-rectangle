import { LineStyle } from 'lightweight-charts';
import { LineToolPaneView, deepCopy, PaneCursorType, AnchorPoint, BoxHorizontalAlignment, BoxVerticalAlignment, TextAlignment, BaseLineTool, merge, InteractionPhase, Point, getToolCullingState, OffScreenState } from 'lightweight-charts-line-tools-core';

// /src/views/LineToolRectanglePaneView.ts
// Import core plugin types and classes
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
class LineToolRectanglePaneView extends LineToolPaneView {
    // Rectangle and Text renderers are now declared and initialized in the BaseLineToolPaneView
    // protected _rectangleRenderer: RectangleRenderer; // No longer need to declare here if initialized in base
    // protected _labelRenderer: TextRenderer; // No longer need to declare here if initialized in base
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
    constructor(source, // Specific tool instance
    chart, // Chart API
    series) {
        // Call the super constructor (LineToolPaneView) to initialize common properties and renderers.
        super(source, chart, series);
        // The renderers (_rectangleRenderer, _labelRenderer, _renderer) are now initialized
        // in the LineToolPaneView base class constructor.
        // We can directly use them here.
    }
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
    _updateImpl(height, width) {
        this._invalidated = false;
        this._renderer.clear();
        //console.log(`[RectanglePaneView] Update triggered. Pane dimensions: ${width}x${height}`);
        const options = this._tool.options();
        if (!options.visible) {
            console.log('[RectanglePaneView] Update stopped: Tool is not visible.');
            return;
        }
        /**
         * CULLING CHECK
         *
         * We query the Model's pre-calculated state. This check now correctly
         * accounts for 2D area visibility and infinite extensions, ensuring
         * the background fill remains visible when the user is zoomed in.
         */
        if (this._tool.isCulled()) {
            //TODO this tool needs cull testing
            //console.log('rectangle culled')
            return;
        }
        const hasUpdatedPoints = this._updatePoints();
        //console.log(`[RectanglePaneView] _updatePoints() returned: ${hasUpdatedPoints}`);
        if (!hasUpdatedPoints) {
            console.log('[RectanglePaneView] Update stopped: Point conversion failed.');
            return;
        }
        //console.log(`[RectanglePaneView] Points available for drawing: ${this._points.length}`);
        if (this._points.length > 0) ;
        // During creation (ghost mode), we will have 2 points (1 real, 1 ghost).
        // When finished, we will have 2 real points.
        if (this._points.length !== this._tool.pointsCount) {
            //console.log(`[RectanglePaneView] Update stopped: Not enough points to draw rectangle. Have ${this._points.length}, need ${this._tool.pointsCount}.`);
            return;
        }
        const rectanglePoints = [this._points[0], this._points[1]];
        // --- 1. Prepare and add the Rectangle Renderer ---
        //console.log('[RectanglePaneView] Preparing and appending RectangleRenderer...');
        // --- Data Construction ---
        /**
         * **Tutorial Note - Preparing Renderer Data:**
         * We are about to feed the `` `RectangleRenderer` ``. This data object acts as the instructions.
         *
         * 1. **...deepCopy(options.rectangle):** We take the user's styling (colors, borders, line width)
         *    directly from the options. `deepCopy` is meant to ensure we don't accidentally mutate the source options
         *    during rendering (though strictly speaking, renderers should be read-only).
         * 2. **points:** We pass the screen coordinates we converted earlier.
         * 3. **Cursors:** We pass the cursors defined in the tool options so the renderer knows what to show
         *    when the user hovers the border (Pointer) or drags the body (Grabbing).
         */
        const rectangleRendererData = {
            ...deepCopy(options.rectangle),
            points: rectanglePoints,
            hitTestBackground: false,
            toolDefaultHoverCursor: options.defaultHoverCursor,
            toolDefaultDragCursor: options.defaultDragCursor,
        };
        this._rectangleRenderer.setData(rectangleRendererData);
        this._renderer.append(this._rectangleRenderer);
        //console.log('[RectanglePaneView] RectangleRenderer appended.');
        // --- 2. Prepare and add the Text Renderer (if applicable) ---
        if (options.text.value) {
            //console.log('[RectanglePaneView] Preparing and appending TextRenderer...');
            /**
             * **Tutorial Note - The Text Layer:**
             * The Rectangle tool supports an optional text label centered or aligned within it.
             *
             * We reuse the *same* `rectanglePoints` used for the shape. The `` `TextRenderer` `` is smart enough
             * to calculate the center/alignment relative to this bounding box.
             *
             * **Hit Testing:**
             * Note that `hitTestBackground` is set to `true` here. This means if the user clicks on the text
             * (or its background box), it counts as clicking the tool itself, allowing for selection or dragging.
             */
            const textRendererData = {
                text: deepCopy(options.text),
                points: rectanglePoints,
                toolDefaultHoverCursor: options.defaultHoverCursor,
                toolDefaultDragCursor: options.defaultDragCursor,
                hitTestBackground: true,
            };
            this._labelRenderer.setData(textRendererData);
            this._renderer.append(this._labelRenderer);
            //console.log('[RectanglePaneView] TextRenderer appended.');
        }
        // --- 3. Prepare and add the Anchor Points for resizing ---
        //if (this.areAnchorsVisible()) {
        //console.log('[RectanglePaneView] Preparing and appending anchors...');
        //this._addAnchors(this._renderer as CompositeRenderer<any>);
        //console.log('[RectanglePaneView] Anchors appended.');
        //}
        this._addAnchors(this._renderer);
    }
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
    _addAnchors(renderer) {
        if (this._points.length < 2)
            return;
        const [point0, point1] = this._points;
        const minX = Math.min(point0.x, point1.x);
        const maxX = Math.max(point0.x, point1.x);
        const minY = Math.min(point0.y, point1.y);
        const maxY = Math.max(point0.y, point1.y);
        const xDiff = point0.x - point1.x;
        const yDiff = point0.y - point1.y;
        const sign = Math.sign(xDiff * yDiff); // Determines primary diagonal direction
        // Cursors based on the diagonal direction for corners
        const diag1Cursor = sign < 0 ? PaneCursorType.DiagonalNeSwResize : PaneCursorType.DiagonalNwSeResize; // NE-SW or NW-SE
        const diag2Cursor = sign < 0 ? PaneCursorType.DiagonalNwSeResize : PaneCursorType.DiagonalNeSwResize; // NW-SE or NE-SW
        // --- DEFINE EACH ANCHOR POINT WITH ITS CANONICAL INDEX ---
        // 0: Top-Left (TL)
        const topLeft = new AnchorPoint(minX, minY, 0, false, diag1Cursor);
        // 6: Top-Center (TC)
        const topCenter = new AnchorPoint((minX + maxX) / 2, minY, 6, true, PaneCursorType.VerticalResize);
        // 3: Top-Right (TR)
        const topRight = new AnchorPoint(maxX, minY, 3, false, diag2Cursor);
        // 5: Middle-Right (MR)
        const middleRight = new AnchorPoint(maxX, (minY + maxY) / 2, 5, true, PaneCursorType.HorizontalResize);
        // 1: Bottom-Right (BR)
        const bottomRight = new AnchorPoint(maxX, maxY, 1, false, diag1Cursor);
        // 7: Bottom-Center (BC)
        const bottomCenter = new AnchorPoint((minX + maxX) / 2, maxY, 7, true, PaneCursorType.VerticalResize);
        // 2: Bottom-Left (BL)
        const bottomLeft = new AnchorPoint(minX, maxY, 2, false, diag2Cursor);
        // 4: Middle-Left (ML)
        const middleLeft = new AnchorPoint(minX, (minY + maxY) / 2, 4, true, PaneCursorType.HorizontalResize);
        const anchorData = {
            // ** NEW: Array is ordered according to the canonical sequence: 0, 6, 3, 5, 1, 7, 2, 4 **
            points: [
                topLeft, topCenter, topRight, middleRight,
                bottomRight, bottomCenter, bottomLeft, middleLeft
            ],
        };
        // Pass tool-level default anchor cursors to createLineAnchor
        const toolOptions = this._tool.options();
        /**
         * **Tutorial Note - Anchor Creation & Composition:**
         *
         * 1. **`this.createLineAnchor(...)`:** This is a helper method provided by the `` `LineToolPaneView` `` base class.
         *    It is highly optimized: it recycles existing renderer instances (object pooling) to avoid
         *    creating new JavaScript objects every frame, which would cause Garbage Collection stutters.
         *
         * 2. **One Renderer, Many Points:** We pass the entire array of 8 `` `AnchorPoint` `` objects to a *single*
         *    `` `LineAnchorRenderer` ``. This is much more efficient than creating 8 separate renderers.
         *
         * 3. **`renderer.append(...)`:** Finally, we add this anchor renderer to the `` `CompositeRenderer` ``.
         *    Since this is added *after* the rectangle and text (in `_updateImpl`), the anchors will draw
         *    **on top** of the shape, which is critical for visibility.
         */
        renderer.append(this.createLineAnchor({
            ...anchorData,
            defaultAnchorHoverCursor: toolOptions.defaultAnchorHoverCursor,
            defaultAnchorDragCursor: toolOptions.defaultAnchorDragCursor,
        }, 0));
    }
}

// /src/model/LineToolRectangle.ts
/**
 * Implements the concrete LineTool for drawing Rectangles.
 * It extends BaseLineTool from the core plugin and defines the rectangle's
 * specific behavior, hit-testing, and associated pane view.
 */
/**
 * Defines the canonical default configuration for the Rectangle tool.
 *
 * **Tutorial Note:**
 * Every line tool should define a static or constant defaults object. This ensures that
 * when a user creates a tool without specific options, it has a valid initial state.
 *
 * This object includes:
 * 1. **Common Options:** Standard flags inherited from the Core (e.g., `visible`, `editable`, `showPriceAxisLabels`).
 * 2. **Tool-Specific Options:** The `rectangle` object defines the specific styling (border, background, extend)
 *    that the `RectangleRenderer` will look for.
 * 3. **Text Options:** Since this tool supports a text label, we define defaults for the
 *    `TextRenderer` here as well.
 *
 * When a tool is instantiated, the user's partial options are deep-merged on top of this object
 * to create the final configuration.
 */
const RectangleOptionDefaults = {
    visible: true,
    editable: true,
    defaultHoverCursor: PaneCursorType.Pointer,
    defaultDragCursor: PaneCursorType.Grabbing,
    defaultAnchorHoverCursor: PaneCursorType.Pointer,
    defaultAnchorDragCursor: PaneCursorType.Grabbing,
    notEditableCursor: PaneCursorType.NotAllowed,
    showPriceAxisLabels: true,
    showTimeAxisLabels: true,
    priceAxisLabelAlwaysVisible: false,
    timeAxisLabelAlwaysVisible: false,
    rectangle: {
        extend: { left: false, right: false },
        background: { color: 'rgba(156,39,176,0.2)' }, // default semi-transparent purple
        border: { radius: 0, width: 1, style: LineStyle.Solid, color: '#9c27b0' }, // default purple border
    },
    text: {
        value: '', // Default empty text
        alignment: TextAlignment.Center,
        font: {
            color: '#FFFFFF',
            size: 12,
            bold: false,
            italic: false,
            family: 'sans-serif',
        },
        box: {
            alignment: { vertical: BoxVerticalAlignment.Middle, horizontal: BoxHorizontalAlignment.Center },
            angle: 0,
            scale: 1,
            padding: { x: 0, y: 0 },
            maxHeight: 0, // Placeholder
            shadow: { blur: 0, color: 'rgba(0,0,0,0)', offset: { x: 0, y: 0 } },
            border: { color: 'rgba(0,0,0,0)', width: 0, radius: 0, highlight: false, style: LineStyle.Solid },
            background: { color: 'rgba(0,0,0,0)', inflation: { x: 0, y: 0 } },
        },
        padding: 0,
        wordWrapWidth: 0,
        forceTextAlign: false,
        forceCalculateMaxLineWidth: false,
    },
};
/**
 * The concrete implementation of the Rectangle line tool.
 *
 * **Tutorial Note:**
 * To create a custom line tool using the Core plugin, you must extend (`BaseLineTool`).
 * This class acts as the "Model" or "Controller" in the MVC pattern:
 * - **Model:** It holds the data points (`_points`) and configuration (`_options`).
 * - **Controller:** It handles logic like geometric normalization, constraint enforcement (Shift key),
 *   and mapping "virtual" resize handles (like the top-center edge) to the actual data points.
 *
 * **Key Responsibilities:**
 * 1. Define the tool's identity (`toolType`) and data structure (`pointsCount`).
 * 2. Instantiate the specific {@link LineToolRectanglePaneView} that knows how to render this tool.
 * 3. Override base methods (like `getPoint` or `setPoint`) if the visual handles differ from the
 *    underlying data points (which is true for Rectangles: 2 data points vs 8 visual handles).
 */
class LineToolRectangle extends BaseLineTool {
    /**
     * Defines the maximum index of interactive resize handles (anchors) supported by this tool.
     *
     * **Tutorial Note - Why Override?**
     * By default, `BaseLineTool` assumes the number of anchors equals `pointsCount`.
     *
     * However, a Rectangle needs more handles than it has data points:
     * - **Data:** 2 Points (Indices 0, 1).
     * - **Visual:** 8 Anchors (4 Corners + 4 Side Midpoints).
     *
     * By returning `7` (Indices 0 to 7), we tell the `InteractionManager` to hit-test and
     * listen for drag events on indices 2 through 7, even though they don't exist in the
     * permanent `_points` array. We will then handle the logic for these "virtual" anchors
     * in `getPoint` and `setPoint`.
     *
     * @returns The maximum zero-based index (7 for 8 anchors).
     * @override
     */
    maxAnchorIndex() {
        return 7; // Anchors are indexed from 0 to 7.
    }
    /**
     * Indicates whether this tool can be created via a sequence of discrete clicks.
     *
     * **Tutorial Note:**
     * Returning `true` enables the "Click-Move-Click" interaction pattern:
     * 1. User clicks once to set the first point (Top-Left).
     * 2. User moves the mouse (without holding the button) to visualize the "ghost" rectangle.
     * 3. User clicks again to set the second point (Bottom-Right) and finish creation.
     *
     * This mode is often preferred for precision placement as it separates positioning from the mechanics of holding a mouse button.
     *
     * @returns `true` to enable discrete click creation.
     * @override
     */
    supportsClickClickCreation() {
        return true; // Rectangle supports click-click creation
    }
    /**
     * Indicates whether this tool can be created via a single drag gesture.
     *
     * **Tutorial Note:**
     * Returning `true` enables the standard "Drag-to-Draw" pattern:
     * 1. User presses the mouse button to set the first point.
     * 2. User drags the mouse to resize the "ghost" rectangle.
     * 3. User releases the mouse button to set the second point and finish creation.
     *
     * Most geometric shape tools (Rectangles, Circles) should support both creation modes
     * to accommodate different user preferences.
     *
     * @returns `true` to enable drag creation.
     * @override
     */
    supportsClickDragCreation() {
        return true; // Rectangle supports click-drag creation
    }
    /**
     * Determines if holding the Shift key should apply geometric constraints during "Click-Move-Click" creation.
     *
     * **Tutorial Note:**
     * If this returns `true`, the `InteractionManager` will call `getShiftConstrainedPoint()`
     * whenever the mouse moves while the Shift key is held.
     *
     * For a Rectangle, this allows the user to force specific alignments (e.g., locking the
     * height or width to the start point) before placing the final corner.
     *
     * @returns `true` to enable constraints during ghosting.
     * @override
     */
    supportsShiftClickClickConstraint() {
        return true; // Rectangle supports Shift constraint during click-click creation
    }
    /**
     * Determines if holding the Shift key should apply geometric constraints during "Drag-to-Draw" creation.
     *
     * **Tutorial Note:**
     * Similar to the click-click variant, this enables `getShiftConstrainedPoint()` during the drag operation.
     *
     * **Why separate flags?**
     * Some tools might behave differently depending on the input method. For example, a "Brush" tool
     * might treat a Shift-Drag as a straight line constraint, but a Shift-Click as a selection modifier.
     * Separating these flags gives you fine-grained control over the UX.
     *
     * @returns `true` to enable constraints during dragging.
     * @override
     */
    supportsShiftClickDragConstraint() {
        return true; // Rectangle supports Shift constraint during click-drag creation
    }
    /**
     * Initializes the Rectangle Tool instance.
     *
     * **Tutorial Note - The "Options Dance":**
     * One of the most critical steps in a custom tool's constructor is handling configuration options correctly.
     *
     * 1. **Deep Copy Defaults:** We use `deepCopy(RectangleOptionDefaults)` instead of using the constant directly.
     *    *Why?* In JavaScript, objects are passed by reference. If we didn't copy, changing the color of
     *    *this* rectangle would change the default color for *all future* rectangles.
     *
     * 2. **Merge User Options:** We apply `merge()` to overlay the user's specific settings (passed in `options`)
     *    onto our fresh copy of the defaults.
     *
     * 3. **Super Call:** We pass the finalized options to `super()`. The Base class stores them and handles
     *    standard interactions (like selection state).
     *
     * 4. **Set Pane Views:** Finally, we instantiate `LineToolRectanglePaneView`. This links the "Model" (this class)
     *    to the "View" (the renderer), telling the Core how to visually represent this data on the chart.
     *
     * @param coreApi - Reference to the plugin core.
     * @param chart - The Lightweight Charts instance.
     * @param series - The series this tool is attached to.
     * @param horzScaleBehavior - Utilities for time scale conversion.
     * @param options - Partial configuration provided by the user.
     * @param points - Initial data points (if restoring from state).
     * @param priceAxisLabelStackingManager - Core utility for managing label overlap.
     */
    constructor(coreApi, // Core API reference with generic type
    chart, // Lightweight Charts chart API instance with generic type
    series, // Primary series API instance with generic type
    horzScaleBehavior, // Horizontal scale behavior with generic type
    // This parameter remains as it is the user input
    options = {}, points = [], priceAxisLabelStackingManager) {
        // 1. Create a deep copy of the canonical default options.
        // We use deepCopy to ensure nested objects (like rectangle, text, box) are unique.
        const finalOptions = deepCopy(RectangleOptionDefaults);
        // 2. Merge the user-provided 'options' into this unique deep-copied base.
        merge(finalOptions, options);
        // 3. Call the BaseLineTool constructor with the final, unique options object.
        super(coreApi, chart, series, horzScaleBehavior, finalOptions, // <-- Pass the final merged and deep-copied options
        points, 'Rectangle', 2, priceAxisLabelStackingManager);
        /**
         * The unique string identifier for this tool type.
         *
         * **Tutorial Note:**
         * This string must match the key used when registering the tool with the
         * ('LineToolsCorePlugin.registerLineTool') method. The Core uses this ID to
         * lookup the correct class constructor when importing data or handling user interactions.
         *
         * @override
         */
        this.toolType = 'Rectangle';
        /**
         * The number of logical data points required to define this tool.
         *
         * **Tutorial Note:**
         * A Rectangle is geometrically defined by exactly **2 diagonal points** (Top-Left and Bottom-Right,
         * or any diagonal pair). Even though the user sees 8 resize handles (corners and sides),
         * the underlying data structure only persists these 2 points.
         *
         * - Use a positive integer (e.g., `2`) for bounded tools.
         * - Use `-1` for unbounded tools (like a Brush or Polyline) that grow as the user draws.
         *
         * @override
         */
        this.pointsCount = 2; // Rectangles are defined by two diagonal points
        // A PaneView is responsible for rendering the tool on the chart.
        this._setPaneViews([new LineToolRectanglePaneView(this, this._chart, this._series)]);
    }
    /**
     * Standardizes the internal point order to ensure a consistent "Top-Left" to "Bottom-Right" orientation.
     *
     * **Tutorial Note:**
     * Users can draw a rectangle in any direction (e.g., starting at Bottom-Right and dragging up to Top-Left).
     * However, simpler rendering and hit-testing math often relies on knowing that:
     * - Point 0 is always the Top-Left (Min Time, Max Price).
     * - Point 1 is always the Bottom-Right (Max Time, Min Price).
     *
     * This method rearranges the internal `_points` array to match this standard. It is called automatically
     * by the `InteractionManager` after creation or editing completes.
     *
     * **Anchor Index Map:**
     * Once normalized, the 8 interactive handles map to indices as follows:
     *
     *        (6) Top-Center
     *           |
     * (0) TL *--*--* TR (3)
     *        |     |
     * (4) ML *     * MR (5)
     *        |     |
     * (2) BL *--*--* BR (1)
     *           |
     *        (7) Bottom-Center
     *
     * @override
     */
    normalize() {
        if (this._points.length < 2) {
            return;
        }
        const [p0, p1] = this._points;
        const minTime = Math.min(p0.timestamp, p1.timestamp);
        const maxTime = Math.max(p0.timestamp, p1.timestamp);
        const minPrice = Math.min(p0.price, p1.price);
        const maxPrice = Math.max(p0.price, p1.price);
        this._points[0] = { timestamp: minTime, price: maxPrice };
        this._points[1] = { timestamp: maxTime, price: minPrice };
    }
    /**
     * Calculates the corrected coordinate when a user drags an anchor while holding the Shift key.
     *
     * **Tutorial Note:**
     * This method is the brain behind "geometric constraints." It overrides the raw mouse position
     * to enforce specific movement rules based on *which* handle is being dragged.
     *
     * **Logic implemented here:**
     * 1. **Creation Phase:** We largely ignore constraints here to let the user draw freely, or we could
     *    enforce a perfect square. Currently, it returns the raw point.
     *
     * 2. **Editing Phase (Corner Anchors 0-3):**
     *    We enforce a "Price Axis Lock". The Y-coordinate is locked to the anchor's original position,
     *    forcing the user to resize width-wise only if they hold Shift.
     *
     * 3. **Editing Phase (Side Anchors 4-7):**
     *    - **Middle-Left/Right (4, 5):** Lock Y (Height). Allow only Width changes.
     *    - **Top/Bottom-Center (6, 7):** Lock X (Time). Allow only Height changes.
     *
     * @param pointIndex - The index of the handle being dragged (0-7).
     * @param rawScreenPoint - The current mouse position in pixels.
     * @param phase - Whether we are creating a new tool or editing an existing one.
     * @param originalLogicalPoint - The logical position of the anchor *before* the drag started.
     * @param allOriginalLogicalPoints - Snapshot of all points before the drag started.
     * @returns A `ConstraintResult` containing the new pixel coordinates and a "snap hint" (time/price/none).
     * @override
     */
    getShiftConstrainedPoint(pointIndex, rawScreenPoint, phase, originalLogicalPoint, allOriginalLogicalPoints) {
        // 1. Convert the anchor being dragged's logical point to its screen coordinates (self-reference)
        const originalScreenPoint = this.pointToScreenPoint(originalLogicalPoint);
        if (!originalScreenPoint) {
            return { point: rawScreenPoint, snapAxis: 'none' };
        }
        //GOTCHA im not going to constrain during creation because it not usefull
        // --- Creation Phase (Simple Y-Lock to P0's Y) ---
        if (phase === InteractionPhase.Creation) {
            // ** FIX: Use the 'originalLogicalPoint' parameter directly, as it always contains P0's position in this phase. **
            // The constraint for the ghost point (P1) is always P0's original Y-coordinate.
            // 'originalLogicalPoint' *is* P0 during creation (as passed from InteractionManager).
            //just return the rawScreenPint and dont constrain
            return { point: rawScreenPoint, snapAxis: 'none' };
        }
        // --- Editing Phase ---
        // 2. Handle Corner Anchors (Indices 0, 1, 2, 3) - Y-Axis Lock (Pure Horizontal Resize)
        if (pointIndex >= 0 && pointIndex <= 3) {
            // Lock Y to the anchor's own original Y coordinate.
            const constrainedY = originalScreenPoint.y;
            // Return the new screen point (X from raw mouse, Y from own original position)
            return {
                point: new Point(rawScreenPoint.x, constrainedY),
                snapAxis: 'price',
            };
        }
        // 3. Handle Side Anchors (Indices 4, 5, 6, 7) - Single-Axis Lock (Pure Vertical or Horizontal Resize)
        if (pointIndex >= 4 && pointIndex <= 7) {
            // Middle-Left (4) / Middle-Right (5) anchors move horizontally (Y is fixed).
            if (pointIndex === 4 || pointIndex === 5) {
                // We enforce Y to be the anchor's original Y, allowing X to be the raw mouse X.
                return {
                    point: new Point(rawScreenPoint.x, originalScreenPoint.y),
                    snapAxis: 'price',
                };
            }
            // Top-Center (6) / Bottom-Center (7) anchors move vertically (X is fixed).
            if (pointIndex === 6 || pointIndex === 7) {
                // We enforce X to be the anchor's original X, allowing Y to be the raw mouse Y.
                return {
                    point: new Point(originalScreenPoint.x, rawScreenPoint.y),
                    snapAxis: 'price',
                };
            }
        }
        // 4. Fallback (Should not be hit)
        return { point: rawScreenPoint, snapAxis: 'none' };
    }
    /**
     * The primary entry point for detecting mouse interactions with this tool.
     *
     * **Tutorial Note - The Delegation Pattern:**
     * `BaseLineTool` does not know what a "Rectangle" looks like or where its borders are.
     * Instead of duplicating geometric math here in the Model, we delegate the question to the **View**.
     *
     * 1. Access the `LineToolRectanglePaneView` associated with this tool.
     * 2. Retrieve its underlying `CompositeRenderer`.
     * 3. Ask the renderer: "Is the point (x,y) touching any of your primitives (borders, background, or anchors)?"
     *
     * This ensures that what the user *sees* (the rendered pixels) matches exactly what they can *click*.
     *
     * @param x - Mouse X coordinate (pixels).
     * @param y - Mouse Y coordinate (pixels).
     * @returns A result object indicating if a hit occurred, what part was hit (body/anchor), and the cursor style.
     * @override
     */
    _internalHitTest(x, y) {
        // A line tool can have multiple pane views (e.g., main, axis views).
        // For a rectangle, we perform hit-testing on its primary pane view.
        if (this._paneViews.length === 0) {
            return null;
        }
        // Get the specific pane view for the Rectangle tool.
        const paneView = this._paneViews[0];
        // The pane view's `renderer()` method returns the actual renderer object,
        // which contains the drawing and hit-testing logic for the rectangle.
        const renderer = paneView.renderer();
        // Delegate the hit test to the renderer.
        // The renderer itself contains the geometric logic (e.g., checking perimeter).
        if (renderer && renderer.hitTest) {
            return renderer.hitTest(x, y);
        }
        return null;
    }
    /**
     * Retrieves the logical position (Time/Price) for a specific anchor handle index.
     *
     * **Tutorial Note - "Virtual Anchors":**
     * This is a critical concept for complex tools.
     * - **Real Data:** The tool actually stores only 2 points: Top-Left (Index 0) and Bottom-Right (Index 1).
     * - **Virtual UI:** The user expects to see and grab 8 handles (corners + midpoints).
     *
     * This method acts as a translator.
     * - If `index` is 0 or 1, it returns the actual stored data.
     * - If `index` is 2-7, it calls `_getAnchorPointForIndex` to calculate where that handle *should* be
     *   geometrically (e.g., the midpoint between Top-Left and Top-Right).
     *
     * This allows the `InteractionManager` to treat virtual handles exactly like real data points.
     *
     * @param index - The 0-7 index of the requested handle.
     * @returns The calculated logical point.
     * @override
     */
    getPoint(index) {
        // The first two points (0 and 1) are the primary definition points already stored.
        if (index < 2) {
            return super.getPoint(index);
        }
        // For indices >= 2, we calculate the position of the virtual resize anchors.
        return this._getAnchorPointForIndex(index);
    }
    /**
     * Updates the tool's geometry based on the movement of a specific anchor handle.
     *
     * **Tutorial Note - "Reverse Mapping":**
     * This is the counterpart to `getPoint`. When the user drags a "Virtual Anchor" (like the Top-Center handle),
     * we cannot just "save" that point because it doesn't exist in our 2-point data structure.
     *
     * Instead, we must translate that movement into updates for the 2 real points (P0 and P1).
     *
     * **Example:**
     * If the user drags **Top-Center (Index 6)** upwards:
     * 1. We read the new Y price.
     * 2. We update **P0's price** (Top) to match.
     * 3. We ignore the X movement (because Top-Center shouldn't change the width in this logic).
     *
     * This ensures the rectangle resizes intuitively while maintaining its data integrity.
     *
     * @param index - The index of the handle being moved (0-7).
     * @param point - The new logical position of that handle.
     * @override
     */
    setPoint(index, point) {
        // If the primary points (0 or 1) are being set, use the base class's method.
        if (index < 2) {
            super.setPoint(index, point);
            return;
        }
        // Handle movement of the 6 virtual anchors by calculating the impact on the two primary points.
        // This logic ensures the rectangle remains axis-aligned and resizes correctly.
        switch (index) {
            case 2: // Bottom-left anchor: affects primary point 0's timestamp and primary point 1's price.
                this._points[1].price = point.price;
                this._points[0].timestamp = point.timestamp;
                break;
            case 3: // Top-right anchor: affects primary point 0's price and primary point 1's timestamp.
                this._points[0].price = point.price;
                this._points[1].timestamp = point.timestamp;
                break;
            case 4: // Middle-left anchor: affects primary point 0's timestamp (horizontal resizing).
                this._points[0].timestamp = point.timestamp;
                break;
            case 5: // Middle-right anchor: affects primary point 1's timestamp (horizontal resizing).
                this._points[1].timestamp = point.timestamp;
                break;
            case 6: // Top-center anchor: affects primary point 0's price (vertical resizing).
                this._points[0].price = point.price;
                break;
            case 7: // Bottom-center anchor: affects primary point 1's price (vertical resizing).
                this._points[1].price = point.price;
                break;
        }
    }
    /**
     * Calculates the Rectangle's visibility based on its 2D area.
     *
     * ### Tutorial Note on Rectangle Culling
     * A Rectangle represents a solid block of space. To prevent the background
     * color from "popping" out when the borders leave the viewport, we use
     * the core's Area-Based culling mode.
     *
     * By passing `isAreaBased: true`, we instruct the engine to perform a
     * 2D bounding box intersection test. This test accounts for infinite
     * horizontal extensions, ensuring that as long as the user is looking
     * at any part of the rectangle's 'Zone of Influence', the tool stays active.
     *
     * @protected
     * @override
     */
    updateCullingState() {
        const points = this.points();
        const options = this.options();
        // 1. Guard: Skip culling during interaction to prevent visual flickering.
        if (this.getPermanentPointsCount() < this.pointsCount || this.isCreating() || this.isEditing()) {
            this._setIsCulled(false);
            return;
        }
        // --- AREA-BASED CULLING START ---
        // 2. Invoke the Core Culler in Area-Based mode.
        // We pass the 2 logical anchors. The core will find the min/max bounds, 
        // apply extensions, and perform a single O(1) overlap check.
        const cullingState = getToolCullingState(points, this, options.rectangle.extend, undefined, undefined, true // isAreaBased: true
        );
        this._setIsCulled(cullingState !== OffScreenState.Visible);
        // --- AREA-BASED CULLING END ---
    }
    /**
     * Calculates the geometric position for any of the 8 resize handles based on the 2 primary points.
     *
     * **Tutorial Note:**
     * This helper function is the math engine for the "Virtual Anchor" concept.
     * It uses the normalized bounds (Min/Max Time and Price) to determine where the side and
     * center handles should sit in logical space.
     *
     * **Logic Table:**
     * - **Top-Left (0):** (Min Time, Max Price)
     * - **Top-Center (6):** (Mid Time, Max Price)
     * - **Top-Right (3):** (Max Time, Max Price)
     * - **Middle-Right (5):** (Max Time, Mid Price)
     * - **Bottom-Right (1):** (Max Time, Min Price)
     * - **Bottom-Center (7):** (Mid Time, Min Price)
     * - **Bottom-Left (2):** (Min Time, Min Price)
     * - **Middle-Left (4):** (Min Time, Mid Price)
     *
     * @param index - The index of the anchor to calculate (0-7).
     * @returns The calculated `LineToolPoint`, or `null` if the tool is not fully formed.
     */
    _getAnchorPointForIndex(index) {
        // Ensure both primary points are defined before calculating virtual anchors.
        if (this._points.length < 2)
            return null;
        const [start, end] = this._points; // Destructure the two primary points
        // Calculate min/max values for price and timestamp to define the rectangle's bounds.
        // NOTE: P0 (start) and P1 (end) are assumed to contain the full range of the rectangle after 'normalize'
        const minPrice = Math.min(start.price, end.price); // Lowest numerical price
        const maxPrice = Math.max(start.price, end.price); // Highest numerical price
        const minTime = Math.min(start.timestamp, end.timestamp); // Earliest time
        const maxTime = Math.max(start.timestamp, end.timestamp); // Latest time
        const midPrice = (minPrice + maxPrice) / 2;
        const midTime = (minTime + maxTime) / 2;
        // Return the LineToolPoint for the specific virtual anchor index, based on the standard definitions.
        switch (index) {
            // NOTE: Indices 0 (TL) and 1 (BR) are handled by the calling `getPoint` method's `super.getPoint(index)`
            // which means _points[0] should be (minTime, maxPrice) and _points[1] should be (maxTime, minPrice)
            // 6: Top-Center (TC) -> (MidTime, MaxPrice)
            case 6: return { price: maxPrice, timestamp: midTime };
            // 3: Top-Right (TR) -> (MaxTime, MaxPrice)
            case 3: return { price: maxPrice, timestamp: maxTime };
            // 5: Middle-Right (MR) -> (MaxTime, MidPrice)
            case 5: return { price: midPrice, timestamp: maxTime };
            // 7: Bottom-Center (BC) -> (MidTime, MinPrice)
            case 7: return { price: minPrice, timestamp: midTime };
            // 2: Bottom-Left (BL) -> (MinTime, MinPrice)
            case 2: return { price: minPrice, timestamp: minTime };
            // 4: Middle-Left (ML) -> (MinTime, MidPrice)
            case 4: return { price: midPrice, timestamp: minTime };
            default: return null;
        }
    }
}

export { LineToolRectangle, LineToolRectanglePaneView };
//# sourceMappingURL=lightweight-charts-line-tools-rectangle.js.map
