import {$$} from '../../utils/Dom';
import {DeviceUtils} from '../../utils/DeviceUtils';
import {SliderEvents, IGraphValueSelectedArgs} from '../../events/SliderEvents';
import {Utils} from '../../utils/Utils';
import d3Scale = require('d3-scale');
import d3 = require('d3');
import Globalize = require('globalize');

export interface IStartSlideEventArgs {
  slider: Slider;
  button: SliderButton;
}

export interface IDuringSlideEventArgs {
  slider: Slider;
  button: SliderButton;
}

export interface IEndSlideEventArgs {
  slider: Slider;
  button: SliderButton;
}

export interface ISliderGraphData {
  start: any;
  y: number;
  end: any;
  isDate?: boolean;
}

export interface ISliderOptions {
  start?: any;
  end?: any;
  excludeOuterBounds?: boolean;
  steps?: number;
  getSteps?: (start: number, end: number) => number[];
  rangeSlider?: boolean;
  displayAsValue?: {
    enable?: boolean;
    unitSign?: string;
    separator?: string;
  };
  displayAsPercent?: {
    enable?: boolean;
    separator?: string;
  };
  valueCaption?: (values: number[]) => string;
  percentCaption?: (percent: number[]) => string;
  dateFormat?: string;
  document?: Document;
  graph?: {
    steps?: number;
    animationDuration?: number;
    margin?: {
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
    }
  };
  dateField?: boolean;
  rounded?: number;
}

export class Slider {
  public steps: number[] = [];
  public currentValues: number[];
  private sliderButton: SliderButton;
  private sliderRange: SliderRange;
  private sliderLine: SliderLine;
  private sliderCaption: SliderCaption;
  private sliderGraph: SliderGraph;

  constructor(public element: HTMLElement, public options: ISliderOptions, public root: HTMLElement) {
    if (this.options.dateField) {
      this.options.start = new Date(this.options.start).getTime();
      this.options.end = new Date(this.options.end).getTime();
    }

    if (this.options.rounded == undefined) {
      this.options.rounded = 0;
    }

    if (this.options.steps || this.options.getSteps) {
      this.buildSteps();
    }

    if (this.options.graph) {
      this.sliderGraph = new SliderGraph(this);
    }

    this.sliderLine = new SliderLine(this);
    _.each(this.sliderLine.build(), (e: HTMLElement) => {
      this.element.appendChild(e);
    });

    if (this.options.rangeSlider) {
      this.sliderRange = new SliderRange(this);
      _.each(this.sliderRange.build(), (e: HTMLElement) => {
        this.element.appendChild(e);
      });
    } else {
      this.sliderButton = new SliderButton(this, 1);
      var btnEl = this.sliderButton.build();
      $$(btnEl).addClass('coveo-no-range-button');
      this.element.appendChild(btnEl);
      this.sliderLine.setActiveWidth(this.sliderButton);
    }

    this.sliderCaption = new SliderCaption(this);
    this.element.appendChild(this.sliderCaption.build());
  }

  public onMoving() {
    if (this.options.rangeSlider) {
      this.sliderRange.setBoundary();
      this.sliderLine.setActiveWidth(this.sliderRange.firstButton, this.sliderRange.secondButton);
    } else {
      this.setButtonBoundary();
      this.sliderLine.setActiveWidth(this.sliderButton);
    }
    if (this.options.graph) {
      this.sliderGraph.draw();
    }
    this.displayCaption();
  }

  public initializeState(values: number[] = [this.options.start, this.options.end]) {
    this.currentValues = values;
    if (this.options.rangeSlider) {
      this.sliderRange.initializeSliderRangeState(values);
      this.sliderLine.setActiveWidth(this.sliderRange.firstButton, this.sliderRange.secondButton);
    } else {
      if (values == undefined) {
        this.sliderButton.toEnd();
      } else {
        this.sliderButton.setValue(values[1]);
      }
      this.setButtonBoundary();
      this.sliderLine.setActiveWidth(this.sliderButton);
    }
    this.displayCaption();
  }

  public getPosition() {
    if (this.options.rangeSlider) {
      return this.sliderRange.getPosition();
    } else {
      return [0, this.sliderButton.getPosition()];
    }
  }

  public getPercentPosition() {
    if (this.options.rangeSlider) {
      return this.sliderRange.getPercentPosition();
    } else {
      return [0, this.sliderButton.getPercent()];
    }
  }

  public getValues() {
    if (this.currentValues != undefined) {
      return this.currentValues;
    } else {
      if (this.options.rangeSlider) {
        return this.sliderRange.getValue();
      } else {
        return [this.options.start, this.sliderButton.getValue()];
      }
    }
  }

  public getCaptionFromValue(values: number[]) {
    return this.sliderCaption.getCaptionFromValues(values);
  }

  public getCaption() {
    return this.sliderCaption.getCaption();
  }

  public setValues(values: number[]) {
    if (values != undefined) {
      values[0] = Math.max(values[0], this.options.start);
      values[1] = Math.min(values[1], this.options.end);
    }
    this.currentValues = values;
    if (this.options.rangeSlider) {
      this.sliderRange.setValue(values);
      this.sliderLine.setActiveWidth(this.sliderRange.firstButton, this.sliderRange.secondButton);
    } else {
      this.sliderButton.setValue(values[1]);
      this.sliderLine.setActiveWidth(this.sliderButton);
    }
    this.displayCaption();
  }

  public drawGraph(data?: ISliderGraphData[]) {
    if (this.sliderGraph) {
      this.sliderGraph.draw(data);
    }
  }

  private setButtonBoundary() {
    this.sliderButton.leftBoundary = 0;
    this.sliderButton.rightBoundary = this.element.clientWidth;
  }

  private displayCaption() {
    if (this.options.valueCaption != undefined) {
      this.sliderCaption.setFromString(this.options.valueCaption(this.getValues()));
    } else if (this.options.percentCaption != undefined) {
      this.sliderCaption.setFromString(this.options.percentCaption(this.getPercentPosition()));
    } else if (this.options.displayAsPercent != undefined && this.options.displayAsPercent.separator != undefined && this.options.displayAsPercent.enable) {
      this.sliderCaption.setAsPercent();
    } else {
      this.sliderCaption.setAsValue();
    }
  }

  private buildSteps() {
    if (this.options.getSteps) {
      this.steps = this.options.getSteps(this.options.start, this.options.end);
    } else {
      var oneStep = (this.options.end - this.options.start) / Math.max(1, this.options.steps);
      if (oneStep > 0) {
        var currentStep = this.options.start;
        while (currentStep <= this.options.end) {
          this.steps.push(currentStep);
          currentStep += oneStep;
        }
      } else {
        this.steps.push(this.options.start);
        this.steps.push(this.options.end);
      }
    }
  }
}

class SliderLine {
  private backGround: HTMLElement;
  private activePart: HTMLElement;

  constructor(public slider: Slider) {
  }

  public build(): HTMLElement[] {
    this.backGround = $$('div', {
      className: 'coveo-slider-line coveo-background'
    }).el;

    this.activePart = $$('div', {
      className: 'coveo-slider-line coveo-active'
    }).el;

    return [this.backGround, this.activePart];
  }

  public setActiveWidth(buttonOne: SliderButton, buttonTwo?: SliderButton) {
    if (this.slider.options.rangeSlider) {
      var width = (buttonTwo.getPercent() - buttonOne.getPercent()) * 100;
      this.activePart.style.width = width + '%';
      this.activePart.style.left = buttonOne.getPercent() * 100 + '%';
      this.activePart.style.right = buttonTwo.getPercent() * 100 + '%';
    } else {
      var width = buttonOne.getPercent() * 100;
      this.activePart.style.width = width + '%';
    }
  }
}

export class SliderButton {
  public leftBoundary: number;
  public rightBoundary: number;
  public element: HTMLElement;
  private currentPos: number;
  private startPositionX: number;
  private isMouseDown: boolean;
  private lastElementLeft: number;
  private origUserSelect: string;
  private origCursor: string;
  private origZIndex: string;

  private eventMouseDown = DeviceUtils.isMobileDevice() ? 'touchstart' : 'mousedown';
  private eventMouseMove = DeviceUtils.isMobileDevice() ? 'touchmove' : 'mousemove';
  private eventMouseUp = DeviceUtils.isMobileDevice() ? 'touchend' : 'mouseup';

  constructor(public slider: Slider, private which: number) {
  }

  public build() {
    this.element = $$('div', {
      className: 'coveo-slider-button'
    }).el;

    this.bindEvents();
    this.element['CoveoSliderButton'] = this;
    return this.element;
  }

  public toBeginning() {
    this.element.style.left = '0%';
  }

  public toEnd() {
    this.element.style.left = '100%';
  }

  public setValue(value: number) {
    var percent = this.fromValueToPercent(value);
    this.element.style.left = Math.round(percent * 100) + '%';
  }

  public getPosition() {
    var left = this.element.style.left;
    if (left.indexOf('%') != -1) {
      return (parseFloat(left) / 100) * this.slider.element.clientWidth;
    } else {
      return parseFloat(left);
    }
  }

  public getPercent(position: number = this.getPosition()) {
    if (this.slider.element.clientWidth == 0) {
      return 0;
    }
    return +(position / this.slider.element.clientWidth).toFixed(2);
  }

  public getValue() {
    var value = this.getPercent() * (this.slider.options.end - this.slider.options.start) + this.slider.options.start;
    return value;
  }

  public fromValueToPercent(value: number) {
    return 1 - ((this.slider.options.end - value) / (this.slider.options.end - this.slider.options.start));
  }

  public fromPositionToValue(position: number) {
    var percent = this.getPercent(position);
    return this.slider.options.start + (percent * (this.slider.options.end - this.slider.options.start));
  }

  public fromValueToPosition(value: number) {
    var percent = this.fromValueToPercent(value);
    return this.slider.element.clientWidth * percent;
  }

  private bindEvents() {
    $$(this.element).on(this.eventMouseDown, (e: MouseEvent) => {
      this.handleStartSlide(e);
    });
    var doc = this.slider.options.document || document;
    doc.addEventListener(this.eventMouseMove, (e: MouseEvent) => {
      if (this.eventMouseMove == 'touchmove' && this.isMouseDown) {
        e.preventDefault();
      }
      this.handleMoving(e);
    });

    doc.addEventListener(this.eventMouseUp, () => {
      this.handleEndSlide();
    });
  }

  private getUserSelect() {
    if (document.body.style.msUserSelect !== undefined) {
      return 'msUserSelect';
    }
    if (document.body.style.webkitUserSelect !== undefined) {
      return 'webkitUserSelect';
    }
    if (document.body.style['MozUserSelect'] !== undefined) {
      return 'MozUserSelect';
    }
    return 'userSelect';
  }

  private handleStartSlide(e: MouseEvent) {
    var position = this.getMousePosition(e);
    this.isMouseDown = true;
    this.startPositionX = position.x;
    this.lastElementLeft = (parseInt(this.element.style.left, 10) / 100) * this.slider.element.clientWidth;
    this.origUserSelect = document.body.style[this.getUserSelect()];
    this.origCursor = document.body.style.cursor;
    document.body.style[this.getUserSelect()] = 'none';
    document.body.style.cursor = 'pointer';
    $$(this.element).addClass('coveo-active');
    $$(this.element).trigger(SliderEvents.startSlide, <IStartSlideEventArgs>{
      button: this,
      slider: this.slider
    });
    e.stopPropagation();
  }

  private handleMoving(e: MouseEvent) {
    if (this.isMouseDown) {
      this.slider.onMoving();
      this.updatePosition(e);
      this.handleButtonNearEnd();
      $$(this.element).trigger(SliderEvents.duringSlide, <IDuringSlideEventArgs>{
        button: this,
        slider: this.slider
      });
    }
  }

  private handleEndSlide() {
    if (this.isMouseDown) {
      document.body.style[this.getUserSelect()] = this.origUserSelect;
      document.body.style.cursor = this.origCursor;
      $$(this.element).removeClass('coveo-active');
      $$(this.element).trigger(SliderEvents.endSlide, <IEndSlideEventArgs>{
        button: this,
        slider: this.slider
      });
    }
    this.isMouseDown = false;
  }

  private handleButtonNearEnd() {
    if (this.which == 0) {
      if (this.origZIndex == undefined) {
        this.origZIndex = this.element.style.zIndex || '1';
      }
      if (this.currentPos > 90) {
        this.element.style.zIndex = this.origZIndex + 1;
      } else {
        this.element.style.zIndex = this.origZIndex;
      }
    }
  }

  private getMousePosition(e: MouseEvent) {
    var posx = 0;
    var posy = 0;
    if (this.eventMouseMove == 'touchmove') {
      posx = e['originalEvent']['touches'][0].pageX;
      posy = e['originalEvent']['touches'][0].pageY;
    } else if (e.pageX || e.pageY) {
      posx = e.pageX;
      posy = e.pageY;
    } else if (e.clientX || e.clientY) {
      posx = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
      posy = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
    }
    return { x: posx, y: posy };
  }

  private updatePosition(e: MouseEvent) {
    var pos = this.getMousePosition(e);
    var spanX = pos.x - this.startPositionX;
    this.currentPos = this.lastElementLeft + spanX;
    if (this.slider.options.steps || this.slider.options.getSteps) {
      var snapResult = this.snapToStep(spanX);
      this.currentPos = snapResult.position;
      var currentValue = snapResult.value;
    }
    this.currentPos = Math.max(this.leftBoundary, this.currentPos);
    this.currentPos = Math.min(this.rightBoundary, this.currentPos);
    this.currentPos = this.getPercent(this.currentPos) * 100;
    this.currentPos = Math.min(this.currentPos, 100);
    this.currentPos = Math.max(this.currentPos, 0);
    this.element.style.left = Math.round(this.currentPos) + '%';
    if (this.slider.options.steps || this.slider.options.getSteps) {
      this.slider.currentValues[this.which] = currentValue;
    } else {
      this.slider.currentValues[this.which] = this.getValue();
    }
  }

  private snapToStep(spanX: number) {
    var diffs = _.map(this.slider.steps, (step, i) => {
      return Math.abs(this.currentPos - this.fromValueToPosition(this.slider.steps[i]));
    });
    var diffsNext = _.map(this.slider.steps, (step, i) => {
      return Math.abs(this.rightBoundary - this.fromValueToPosition(this.slider.steps[i]));
    });
    var diffsPrev = _.map(this.slider.steps, (step, i) => {
      return Math.abs(this.leftBoundary - this.fromValueToPosition(this.slider.steps[i]));
    });
    var nearest = _.min(diffs);
    var nearestNext = _.min(diffsNext);
    var nearestPrevious = _.min(diffsPrev);
    var currentStep = this.slider.steps[_.indexOf(diffs, nearest)];
    var nextStep = this.slider.steps[_.indexOf(diffsNext, nearestNext)];
    var previousStep = this.slider.steps[_.indexOf(diffsPrev, nearestPrevious)];
    currentStep = Math.min(currentStep, nextStep);
    currentStep = Math.max(currentStep, previousStep);
    return { position: this.fromValueToPosition(currentStep), value: currentStep };
  }
}

class SliderRange {
  public firstButton: SliderButton;
  public secondButton: SliderButton;

  constructor(public slider: Slider) {
    this.firstButton = new SliderButton(slider, 0);
    this.secondButton = new SliderButton(slider, 1);
  }

  public build(): HTMLElement[] {
    var firstElem = this.firstButton.build();
    var secondElem = this.secondButton.build();
    $$(secondElem).addClass('coveo-range-button');
    return [firstElem, secondElem];
  }

  public initializeSliderRangeState(values?: number[]) {
    if (values == undefined) {
      this.firstButton.toBeginning();
      this.secondButton.toEnd();
    } else {
      this.firstButton.setValue(values[0]);
      this.secondButton.setValue(values[1]);
    }
    this.setBoundary();
  }

  public setValue(values: number[]) {
    this.firstButton.setValue(values[0]);
    this.secondButton.setValue(values[1]);
  }

  public setBoundary() {
    this.firstButton.leftBoundary = 0;
    this.firstButton.rightBoundary = this.secondButton.getPosition();
    this.secondButton.leftBoundary = this.firstButton.getPosition();
    this.secondButton.rightBoundary = this.slider.element.clientWidth;
  }

  public getPosition() {
    return [this.firstButton.getPosition(), this.secondButton.getPosition()];
  }

  public getPercentPosition() {
    return [this.firstButton.getPercent(), this.secondButton.getPercent()];
  }

  public getValue() {
    return [this.firstButton.getValue(), this.secondButton.getValue()];
  }
}

class SliderCaption {
  private caption: HTMLElement;

  public unitSign: string;
  public separator: string;

  constructor(public slider: Slider) {
    this.separator = '-';
    this.unitSign = '';
    if (this.slider.options.displayAsPercent && this.slider.options.displayAsPercent.enable) {
      this.separator = this.slider.options.displayAsPercent.separator != undefined ? this.slider.options.displayAsPercent.separator : this.separator;
    } else if (this.slider.options.displayAsValue && this.slider.options.displayAsValue.enable) {
      this.separator = this.slider.options.displayAsValue.separator != undefined ? this.slider.options.displayAsValue.separator : this.separator;
      this.unitSign = this.slider.options.displayAsValue.unitSign != undefined ? this.slider.options.displayAsValue.unitSign : this.unitSign;
    }
  }

  public build(): HTMLElement {
    this.caption = $$('div', {
      className: 'coveo-slider-caption'
    }).el;
    return this.caption;
  }

  public getCaption() {
    return $$(this.caption).text();
  }

  public getCaptionFromValues(values: number[]) {
    return this.getValueCaption(values);
  }

  public getCaptionFromValuesAsPercent(values: number[]) {
    return this.getValueCaption(values);
  }

  public setAsValue() {
    $$(this.caption).text(this.getValueCaption());
  }

  public setAsPercent() {
    var values = this.slider.getPercentPosition();
    $$(this.caption).text([(values[0] * 100).toFixed(this.slider.options.rounded), '%', this.separator, (values[1] * 100).toFixed(this.slider.options.rounded), '%'].join(' '));
  }

  public setFromString(str: string) {
    $$(this.caption).text(str);
  }

  private getValueCaption(values = this.slider.getValues()) {
    var first = values[0];
    var second = values[1];

    if (this.slider.options.dateField) {
      var firstAsDate = new Date(first);
      var secondAsDate = new Date(second);
      firstAsDate.setHours(0, 0, 0, 0);
      secondAsDate.setHours(0, 0, 0, 0);
      first = Globalize.format(firstAsDate, this.slider.options.dateFormat || 'MMM dd, yyyy');
      second = Globalize.format(secondAsDate, this.slider.options.dateFormat || 'MMM dd, yyyy');
      this.unitSign = '';
    } else {
      first = first.toFixed(this.slider.options.rounded);
      second = second.toFixed(this.slider.options.rounded);
    }
    return [first, this.unitSign, this.separator, second, this.unitSign].join(' ');
  }
}

class SliderGraph {
  private svg: any;
  private x: any;
  private y: any;
  private oldData: ISliderGraphData[];
  private tooltip: HTMLElement;

  constructor(public slider: Slider) {
    this.svg = d3.select(slider.element).append('svg').append('g');
    this.x = d3Scale.scaleBand();
    this.y = d3Scale.scaleLinear();
    this.slider.options.graph.margin = Utils.extendDeep({
      top: 20,
      right: 0,
      left: 0,
      bottom: 20
    }, this.slider.options.graph.margin || {});
    this.slider.options.graph.animationDuration = this.slider.options.graph.animationDuration || 500;

    this.tooltip = $$('div', {
      className: 'coveo-slider-tooltip'
    }).el;
    this.tooltip.style.display = 'none';
    this.slider.element.appendChild(this.tooltip);
    this.slider.options.graph.steps = this.slider.options.graph.steps || 10;
  }

  public draw(data: ISliderGraphData[] = this.oldData) {
    if (data) {
      var sliderOuterWidth = this.slider.element.offsetWidth;
      var sliderOuterHeight = this.slider.element.offsetHeight;
      var width = sliderOuterWidth - this.slider.options.graph.margin.left - this.slider.options.graph.margin.right;
      var height = sliderOuterHeight - this.slider.options.graph.margin.top - this.slider.options.graph.margin.bottom;

      this.applyTransformOnSvg(width, height);
      this.setXAndYRange(width, height);
      this.setXAndYDomain(data);

      var bars = this.svg.selectAll('.coveo-bar').data(data);
      var currentSliderValues = this.slider.getValues();
      this.renderGraphBars(bars, width, height, currentSliderValues);
      this.setGraphBarsTransition(bars, height, currentSliderValues);
      this.oldData = data;
    }
  }

  private setXAndYRange(width: number, height: number) {
    this.x.range([0, width]);
    this.x.padding(0.2);
    this.y.range([height - this.slider.options.graph.margin.top, 0]);
  }

  private setXAndYDomain(data: ISliderGraphData[]) {
    this.padGraphWithEmptyData(data);
    this.x.domain(_.map(data, (d) => {
      return d.start;
    }));
    this.y.domain([0, d3.max(data, (d) => {
      return d.y;
    })]);
  }

  private padGraphWithEmptyData(data: ISliderGraphData[]) {
    var oneStepOfGraph = data[0].end - data[0].start;
    if (oneStepOfGraph != 0) {
      this.padBeginningOfGraphWithEmptyData(data, oneStepOfGraph);
      this.padEndOfGraphWithEmptyData(data, oneStepOfGraph);
    }
  }

  private padBeginningOfGraphWithEmptyData(data: ISliderGraphData[], oneStepOfGraph: number) {
    if (data[0].start > this.slider.options.start) {
      var difToFillAtStart = data[0].start - this.slider.options.start;
      var nbOfStepsAtStart = Math.round(difToFillAtStart / oneStepOfGraph);
      var currentStep = data[0].start;
      for (var i = nbOfStepsAtStart; i > 0; i--) {
        data.unshift(<ISliderGraphData>{ start: currentStep - oneStepOfGraph, end: currentStep, y: 0 });
        currentStep -= oneStepOfGraph;
      }
    }
  }

  private padEndOfGraphWithEmptyData(data: ISliderGraphData[], oneStepOfGraph: number) {
    var lastDataIndex = data.length - 1;
    if (data[lastDataIndex].end < this.slider.options.end) {
      var diffToFillAtEnd = this.slider.options.end - data[lastDataIndex].end;
      var nbOfStepsAtEnd = Math.round(diffToFillAtEnd / oneStepOfGraph);
      var currentStep = data[lastDataIndex].end;
      for (var i = 0; i < nbOfStepsAtEnd; i++) {
        data.push(<ISliderGraphData>{ start: currentStep, end: currentStep + oneStepOfGraph, y: 0 });
        currentStep += oneStepOfGraph;
      }
    }
  }

  private applyTransformOnSvg(width: number, height: number) {
    var svg = $$(this.slider.element).find('svg');
    svg.setAttribute('width', width + 'px');
    svg.setAttribute('height', height + 'px');
    this.svg.attr('transform', 'translate(' + this.slider.options.graph.margin.left + ',' + this.slider.options.graph.margin.top + ')');
  }

  private renderGraphBars(bars: D3.UpdateSelection, width: number, height: number, currentSliderValues: number[]) {
    bars.enter().append('rect')
      .attr('class', this.getFunctionForClass(currentSliderValues))
      .attr('width', this.x.bandwidth())
      .attr('height', this.getFunctionForHeight(height))
      .attr('x', this.getFunctionForX())
      .attr('y', this.getFunctionForY())
      .on('click', this.getFunctionForClick())
      .on('mouseover', this.getFunctionForMouseOver(height))
      .on('mouseout', this.getFunctionForMouseOut());
  }

  private setGraphBarsTransition(bars: D3.UpdateSelection, height: number, currentSliderValues: number[]) {
    bars
      .transition()
      .attr('x', this.getFunctionForX())
      .attr('width', this.x.bandwidth())
      .attr('class', this.getFunctionForClass(currentSliderValues))
      .transition()
      .duration(this.slider.options.graph.animationDuration)
      .attr('y', this.getFunctionForY())
      .attr('height', this.getFunctionForHeight(height));
  }

  private getBarClass(currentSliderValues: number[], d: ISliderGraphData, i: number) {
    if (d.start >= currentSliderValues[0] && d.end <= currentSliderValues[1]) {
      return 'coveo-active';
    } else if (currentSliderValues[0] == this.slider.options.start && i == 0) {
      return 'coveo-active';
    } else if (currentSliderValues[1] == this.slider.options.end && i == this.slider.options.graph.steps - 1) {
      return 'coveo-active';
    } else {
      return '';
    }
  }

  private setTooltip(d: ISliderGraphData, height: number) {
    var caption = $$('span', {
      className: 'coveo-caption'
    });
    caption.text(this.slider.getCaptionFromValue([d.start, d.end]));

    var count = $$('span', {
      className: 'coveo-count'
    });
    count.text(d.y.toString());
    $$(this.tooltip).empty();
    this.tooltip.appendChild(caption.el);
    this.tooltip.appendChild(count.el);

    this.tooltip.style.display = 'block';
    this.tooltip.style.left = (this.x(d.start) - (0.2 * this.slider.options.graph.steps)) + 'px';
    this.tooltip.style.top = (this.y(d.y) - height) + 'px';
  }

  private getFunctionForX() {
    return (d: ISliderGraphData) => {
      return this.x(d.start);
    };
  }

  private getFunctionForY() {
    return (d: ISliderGraphData) => {
      return this.y(d.y);
    };
  }

  private getFunctionForHeight(height: number) {
    return (d: ISliderGraphData) => {
      return height - this.y(d.y);
    };
  }

  private getFunctionForClass(currentSliderValues: number[]) {
    return (d, i) => {
      return 'coveo-bar ' + this.getBarClass(currentSliderValues, d, i);
    };
  }

  private getFunctionForClick() {
    return (d: ISliderGraphData, i) => {
      $$(this.slider.element).trigger(SliderEvents.graphValueSelected, <IGraphValueSelectedArgs>{
        start: d.start,
        end: d.end,
        value: d.y
      });
    };
  }

  private getFunctionForMouseOver(height: number) {
    return (d: ISliderGraphData) => {
      this.setTooltip(d, height);
    };
  }

  private getFunctionForMouseOut() {
    return () => {
      this.tooltip.style.display = 'none';
    };
  }
}
