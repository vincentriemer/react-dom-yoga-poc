import React, { PureComponent } from "react";
import Yoga from "yoga-layout";
import Animar from "animar";

// event batching/throttling
(() => {
  var throttle = function(type, name, obj) {
    obj = obj || window;
    var running = false;
    var func = function() {
      if (running) {
        return;
      }
      running = true;
      requestAnimationFrame(function() {
        obj.dispatchEvent(new CustomEvent(name));
        running = false;
      });
    };
    obj.addEventListener(type, func);
  };

  throttle("resize", "optimizedResize");
  throttle("dirty-layout", "optimizedDirtyLayout");
  throttle("update-layout", "optimizedUpdateLayout");
})();

var animar = new Animar({
  defaults: {
    easingFunction: function(t, b, c, d) {
      t /= d / 2;
      if (t < 1) {
        return c / 2 * t * t + b;
      }
      t--;
      return -c / 2 * (t * (t - 2) - 1) + b;
    },
  },
});

const layoutProps = [
  "flexDirection",
  "justifyContent",
  "alignContent",
  "alignItems",
  "alignSelf",
  "flexWrap",
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "margin",
  "padding",
  "border",
  "width",
  "height",
];

function extractLayoutProps(props) {
  const layout = {};
  const style = {};

  for (const propName in props) {
    if (layoutProps.includes(propName)) {
      layout[propName] = props[propName];
    } else {
      style[propName] = props[propName];
    }
  }

  return [layout, style];
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

class BaseComponent extends PureComponent {
  bindClassFunctions(...functionNames) {
    functionNames.forEach(name => {
      this[name] = this[name].bind(this);
    });
  }
}

class View extends BaseComponent {
  constructor(props, context) {
    super(props, context);

    this.state = {
      layout: {
        top: 0,
        left: 0,
        width: 0,
        height: 0,
      },
      nodeChildren: React.Children.map(props.children, child => {
        const childNode = Yoga.Node.create();
        props.node.insertChild(childNode);
        return childNode;
      }),
    };

    this.bindClassFunctions("handleLayout", "updateNodeLayout");
    this.updateNodeLayout();
  }

  componentDidMount() {
    window.addEventListener("optimizedUpdateLayout", this.handleLayout, false);
    this.updatePosition(this.state.layout, this.state.layout);
  }

  handleLayout() {
    const layout = this.props.node.getComputedLayout();
    this.setState({
      layout,
    });
  }

  componentWillUpdate(_, nextState) {
    this.updatePosition(nextState.layout, this.state.layout);
  }

  componentWillReceiveProps(nextProps) {
    this.updateNodeLayout(nextProps);
  }

  updatePosition(nextLayout, currentLayout) {
    const animationConfig = {};

    if (nextLayout.left !== currentLayout.left)
      animationConfig["translateX"] = [currentLayout.left, nextLayout.left];

    if (nextLayout.top !== currentLayout.top)
      animationConfig["translateY"] = [currentLayout.top, nextLayout.top];

    animar.add(this.target, animationConfig).start();
  }

  updateNodeLayout() {
    const { node, style = {} } = this.props;
    const [layout] = extractLayoutProps(style);
    for (const key in layout) {
      if (layout.hasOwnProperty(key)) {
        const setter = `set${capitalizeFirstLetter(key)}`;
        const value = layout[key];

        if (Array.isArray(value)) {
          node[setter](...value);
        } else {
          node[setter](value);
        }
      }
    }
    this.context.triggerLayout();
  }

  render() {
    const { layout, nodeChildren } = this.state;
    const { style, children } = this.props;

    const modifiedChildren = React.Children.map(children, (child, index) => {
      return React.cloneElement(child, { node: nodeChildren[index] });
    });

    const [_, extractedStyle] = extractLayoutProps(style);

    const resolvedStyle = {
      ...extractedStyle,
      position: "fixed",
      top: 0,
      left: 0,
      width: layout.width,
      height: layout.height,
    };

    return (
      <div
        ref={target => {
          this.target = target;
        }}
        style={resolvedStyle}
      >
        {modifiedChildren}
      </div>
    );
  }
}

View.contextTypes = {
  triggerLayout: React.PropTypes.func,
};

class RootView extends BaseComponent {
  constructor(props) {
    super(props);

    this.state = {
      layout: {
        top: 0,
        left: 0,
        width: 0,
        height: 0,
      },
      childNode: Yoga.Node.create(),
    };

    this.dirtyEvent = new Event("dirty-layout");
    this.layoutEvent = new Event("update-layout");
    this.bindClassFunctions("initializeNode", "handleDirty", "handleResize");

    this.initializeNode();
  }

  initializeNode() {
    this.node = Yoga.Node.create();
    this.node.setFlexGrow(1);
    this.node.insertChild(this.state.childNode);
  }

  handleDirty() {
    this.node.calculateLayout();
    window.dispatchEvent(this.layoutEvent);
  }

  handleResize() {
    this.node.setWidth(window.innerWidth);
    this.node.setHeight(window.innerHeight);
    window.dispatchEvent(this.dirtyEvent);
  }

  componentDidMount() {
    window.addEventListener("optimizedUpdateLayout", this.handleLayout, false);
    window.addEventListener("optimizedDirtyLayout", this.handleDirty, false);
    window.addEventListener("optimizedResize", this.handleResize, false);
    this.handleResize();
  }

  getChildContext() {
    return { triggerLayout: () => window.dispatchEvent(this.dirtyEvent) };
  }

  render() {
    const { layout, childNode } = this.state;
    const { children } = this.props;

    return React.cloneElement(React.Children.only(children), {
      node: childNode,
    });
  }
}

RootView.childContextTypes = {
  triggerLayout: React.PropTypes.func,
};

const TestChild = props => (
  <View
    style={{
      width: 100,
      height: 100,
      backgroundColor: "#ACDD31",
      margin: [Yoga.EDGE_ALL, 25],
    }}
    {...props}
  />
);

class App extends BaseComponent {
  render() {
    const testChildren = [];
    for (let i = 0; i < 20; i++) {
      testChildren.push(<TestChild key={i} />);
    }
    return (
      <RootView>
        <View
          style={{
            flexGrow: 1,
            flexDirection: Yoga.FLEX_DIRECTION_ROW,
            flexWrap: Yoga.WRAP_WRAP,
            justifyContent: Yoga.JUSTIFY_SPACE_AROUND,
          }}
        >
          {testChildren}
        </View>
      </RootView>
    );
  }
}

export default App;
