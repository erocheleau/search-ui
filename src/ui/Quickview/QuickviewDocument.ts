import {Component} from '../Base/Component';
import {IComponentBindings} from '../Base/ComponentBindings';
import {ComponentOptions} from '../Base/ComponentOptions';
import {analyticsActionCauseList} from '../Analytics/AnalyticsActionListMeta';
import {IQueryResult} from '../../rest/QueryResult';
import {Assert} from '../../misc/Assert';
import {$$, Dom} from '../../utils/Dom';
import {IOpenQuickviewEventArgs} from '../../events/ResultListEvents';
import {QuickviewEvents, IQuickviewLoadedEventArgs} from '../../events/QuickviewEvents';
import {DeviceUtils} from '../../utils/DeviceUtils';
import {Utils} from '../../utils/Utils';
import {ColorUtils} from '../../utils/ColorUtils';
import {Initialization} from '../Base/Initialization';
import {IQuery} from '../../rest/Query';
import {IViewAsHtmlOptions} from '../../rest/SearchEndpointInterface';
import {AjaxError} from '../../rest/AjaxError';
import {l} from '../../strings/Strings';

const HIGHLIGHT_PREFIX = 'CoveoHighlight';

export interface IQuickviewDocumentOptions {
  maximumDocumentSize?: number;
}

interface IWord {
  text: string;
  count: number;
  index: number;
  termsCount: number;
  element: HTMLElement;
  occurence: number;
}

interface IWordState {
  word: IWord;
  color: string;
  currentIndex: number;
  index: number;
}

/**
 * The QuickviewDocument component is meant to exist within Result Templates, more specifically inside a {@link Quickview} component.
 * The sole purpose of this component is to include an iframe which will load the correct HTML version of the current document.
 * By default, this component is included in the default template for a {@link Quickview} component.
 */
export class QuickviewDocument extends Component {
  static ID = 'QuickviewDocument';

  /**
   * The options for the component
   * @componentOptions
   */
  static options: IQuickviewDocumentOptions = {
    /**
     * Specifies the maximum document size (the preview) that should be returned by the index.
     *
     * By default its value is 0, and the whole preview is returned.
     */
    maximumDocumentSize: ComponentOptions.buildNumberOption({ defaultValue: 0, min: 0 }),
  };

  private iframe: Dom;
  private header: Dom;
  private termsToHighlightWereModified: boolean;
  private keywordsState: IWordState[];

  /**
   * Create a new instance of the component
   * @param element
   * @param options
   * @param bindings
   * @param result
   */
  constructor(public element: HTMLElement, public options?: IQuickviewDocumentOptions, bindings?: IComponentBindings, public result?: IQueryResult) {
    super(element, QuickviewDocument.ID, bindings);

    this.options = ComponentOptions.initComponentOptions(element, QuickviewDocument, options);
    this.result = result || this.resolveResult();
    this.termsToHighlightWereModified = false;
    Assert.exists(this.result);
  }

  public createDom() {
    let container = $$('div');
    container.addClass('coveo-quickview-document');
    this.element.appendChild(container.el);

    this.header = this.buildHeader();
    this.iframe = this.buildIFrame();

    container.append(this.header.el);
    container.append(this.iframe.el);
  }

  public open() {
    this.ensureDom();
    let documentURL = $$(this.element).getAttribute('href');
    if (documentURL == undefined || documentURL == '') {
      documentURL = this.result.clickUri;
    }
    this.usageAnalytics.logClickEvent(analyticsActionCauseList.documentQuickview, {
      author: this.result.raw.author,
      documentURL: documentURL,
      documentTitle: this.result.title
    }, this.result, this.queryController.element);
    let beforeLoad = (new Date()).getTime();
    let iframe = <HTMLIFrameElement>this.iframe.find('iframe');
    iframe.src = 'about:blank';
    let endpoint = this.queryController.getEndpoint();

    let termsToHighlight = _.keys(this.result.termsToHighlight);
    let dataToSendOnOpenQuickView: IOpenQuickviewEventArgs = {
      termsToHighlight: termsToHighlight
    };

    $$(this.element).trigger(QuickviewEvents.openQuickview, dataToSendOnOpenQuickView);
    this.checkIfTermsToHighlightWereModified(dataToSendOnOpenQuickView.termsToHighlight);

    let queryObject = _.extend({}, this.getBindings().queryController.getLastQuery());

    if (this.termsToHighlightWereModified) {
      this.handleTermsToHighlight(dataToSendOnOpenQuickView.termsToHighlight, queryObject);
    }

    let callOptions: IViewAsHtmlOptions = {
      queryObject: queryObject,
      requestedOutputSize: this.options.maximumDocumentSize
    };

    endpoint.getDocumentHtml(this.result.uniqueId, callOptions)
      .then((html: HTMLDocument) => {
        // If the contentDocument is null at this point it means that the Quick View
        // was closed before we've finished loading it. In this case do nothing.
        if (iframe.contentDocument == null) {
          return;
        }

        this.renderHTMLDocument(iframe, html);
        this.triggerQuickviewLoaded(beforeLoad);
      })
      .catch((error: AjaxError) => {
        // If the contentDocument is null at this point it means that the Quick View
        // was closed before we've finished loading it. In this case do nothing.
        if (iframe.contentDocument == null) {
          return;
        }

        if (error.status != 0) {
          this.renderErrorReport(iframe, error.status);
          this.triggerQuickviewLoaded(beforeLoad);
        } else {
          iframe.onload = () => {
            this.triggerQuickviewLoaded(beforeLoad);
          };
          iframe.src = endpoint.getViewAsHtmlUri(this.result.uniqueId, callOptions);
        }
      });
  }

  protected renderHTMLDocument(iframe: HTMLIFrameElement, html: HTMLDocument) {
    iframe.onload = () => {
      this.computeHighlights(iframe.contentWindow);

      // Remove white border for new Quickview
      if (this.isNewQuickviewDocument(iframe.contentWindow)) {
        let body = $$(this.element).closest('.coveo-body');
        body.style.padding = '0';
        let header = $$(this.element).find('.coveo-quickview-header');
        header.style.paddingTop = '10';
        header.style.paddingLeft = '10';
      }

      if ($$(this.element).find('.coveo-quickview-header').innerHTML == '') {
        $$(this.element).find('.coveo-quickview-header').style.display = 'none';
      }
    };

    this.writeToIFrame(iframe, html);
    this.wrapPreElementsInIframe(iframe);
  }


  private renderErrorReport(iframe: HTMLIFrameElement, errorStatus: number) {
    let errorString = '';
    if (errorStatus == 400) {
      errorString = 'NoQuickview';
    } else {
      errorString = 'OopsError';
    }
    let errorMessage = `<html><body style='font-family: Arimo, \'Helvetica Neue\', Helvetica, Arial, sans-serif; -webkit-text-size-adjust: none;' >${l(errorString)} </body></html>`;
    this.writeToIFrame(iframe, errorMessage);
  }

  private writeToIFrame(iframe: HTMLIFrameElement, content: HTMLDocument);
  private writeToIFrame(iframe: HTMLIFrameElement, content: String);
  private writeToIFrame(iframe: HTMLIFrameElement, content: any) {
    let toWrite = content;
    // This sucks because we can't do instanceof HTMLDocument
    // lib.d.ts declare HTMLDocument as an interface, not an actual object
    if (typeof content == 'object') {
      toWrite = content.getElementsByTagName('html')[0].outerHTML;
    }

    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(toWrite);
    iframe.contentWindow.document.close();
  }

  private wrapPreElementsInIframe(iframe: HTMLIFrameElement) {
    try {
      let style = document.createElement('style');
      style.type = 'text/css';

      // This CSS forces <pre> tags used in some emails to wrap by default
      let cssText = 'html pre { white-space: pre-wrap; white-space: -moz-pre-wrap; white-space: -pre-wrap; white-space: -o-pre-wrap; word-wrap: break-word; }';

      // Some people react strongly when presented with their browser's default font, so let's fix that
      cssText += 'body, html { font-family: Arimo, \'Helvetica Neue\', Helvetica, Arial, sans-serif; -webkit-text-size-adjust: none; }';

      if (DeviceUtils.isIos()) {
        // Safari on iOS forces resize iframes to fit their content, even if an explicit size
        // is set on the iframe. Isn't that great? By chance there is a trick around it: by
        // setting a very small size on the body and instead using min-* to set the size to
        // 100% we're able to trick Safari from thinking it must expand the iframe. Amazed.
        // The 'scrolling' part is required otherwise the hack doesn't work.
        //
        // http://stackoverflow.com/questions/23083462/how-to-get-an-iframe-to-be-responsive-in-ios-safari
        cssText += 'body, html { height: 1px !important; min-height: 100%; overflow: scroll; }';
        $$(iframe).setAttribute('scrolling', 'no');

        // Some content is cropped on iOs if a margin is present
        // We remove it and add one on the iframe wrapper.
        cssText += 'body, html {margin: auto}';
        iframe.parentElement.style.margin = '0 0 5px 5px';

        // While we're on the topic of iOS Safari: This magic trick prevents iOS from NOT
        // displaying the content of the iframe. If we don't do this, you'll see the body
        // of the iframe ONLY when viewing the page in the tab switcher.  Isn't that *magical*?
        iframe.style.position = 'relative';
      }

      if ('styleSheet' in style) {
        style['styleSheet'].cssText = cssText;
      } else {
        style.appendChild(document.createTextNode(cssText));
      }
      let head = iframe.contentWindow.document.head;
      head.appendChild(style);
    } catch (e) {
      // if not allowed
    }
  }

  private triggerQuickviewLoaded(beforeLoad: number) {
    let afterLoad = (new Date()).getTime();
    let eventArgs: IQuickviewLoadedEventArgs = { duration: afterLoad - beforeLoad };
    $$(this.element).trigger(QuickviewEvents.quickviewLoaded, eventArgs);
  }

  // An highlighted term looks like:
  //
  //     <span id='CoveoHighlight:X.Y.Z'>a</span>
  //
  // The id has 3 components:
  // - X: the term
  // - Y: the term occurence
  // - Z: the term part
  //
  // For the 'Z' component, if the term 'foo bar' is found in multiple elements, we will see:
  //
  //     <span id='CoveoHighlight:1.1.1'>foo</span>
  //     <span id='CoveoHighlight:1.1.2'>bar</span>
  //
  // Highlighted words can overlap, which looks like:
  //
  //     <span id='CoveoHighlight:1.Y.Z'>
  //         a
  //         <coveotaggedword id='CoveoHighlight:2.Y.Z'>b</coveotaggedword>
  //     </span>
  //     <span id='CoveoHighlight:2.Y.Z'>c</span>
  //
  // In the previous example, the words 'ab' and 'bc' are highlighted.
  //
  // One thing important to note is that the id of all 'coveotaggedword' for
  // the same word AND the first 'span' for that word will have the same id.
  //
  // Example:
  //
  //     <span id='CoveoHighlight:1.1.1'>
  //         a
  //         <coveotaggedword id='CoveoHighlight:2.1.1'>b</coveotaggedword>
  //     </span>
  //     <span id='CoveoHighlight:1.1.2'>
  //         c
  //         <coveotaggedword id='CoveoHighlight:2.1.1'>d</coveotaggedword>
  //     </span>
  //     <span id='CoveoHighlight:2.1.1'>e</span>
  //     <span id='CoveoHighlight:2.1.2'>f</span>
  //
  // In the previous example, the words 'abcd' and 'bcdef' are highlighted.
  //
  // This method is public for testing purposes.
  public computeHighlights(window: Window): string[] {
    $$(this.header).empty();
    this.keywordsState = [];

    let words: { [index: string]: IWord } = {};
    let highlightsCount = 0;
    _.each($$(window.document.body).findAll('[id^="' + HIGHLIGHT_PREFIX + '"]'), (element: HTMLElement, index: number) => {
      let idParts = this.getHighlightIdParts(element);

      if (idParts) {
        let idIndexPart = idParts[1];                    // X
        let idOccurencePart = parseInt(idParts[2], 10);  // Y
        let idTermPart = parseInt(idParts[3], 10);       // Z in <span id='CoveoHighlight:X.Y.Z'>a</span>

        let word = words[idIndexPart];

        // The 'idTermPart' check is to circumvent a bug from the index
        // where an highlight of an empty string start with an idTermPart > 1.
        if (word == null && idTermPart == 1) {
          words[idIndexPart] = word = {
            text: this.getHighlightInnerText(element),
            count: 1,
            index: parseInt(idIndexPart, 10),

            // Here I try to be clever.
            // An overlaping word:
            // 1) always start with a 'coveotaggedword' element.
            // 2) then other 'coveotaggedword' elements may follow
            // 3) then a 'span' element may follow.
            //
            // All 1), 2) and 3) will have the same id so I consider them as
            // a whole having the id 0 instead of 1.
            termsCount: element.nodeName.toLowerCase() == 'coveotaggedword' ? 0 : 1,
            element: element,
            occurence: idOccurencePart
          };
        } else if (word) {
          if (word.occurence == idOccurencePart) {
            if (element.nodeName.toLowerCase() == 'coveotaggedword') {
              word.text += this.getHighlightInnerText(element);
              // Doesn't count as a term part (see method description for more info).
            } else if (word.termsCount < idTermPart) {
              word.text += this.getHighlightInnerText(element);
              word.termsCount += 1;
            }
          }

          word.count = Math.max(word.count, idOccurencePart);
          highlightsCount += 1;
        }

        // See the method description to understand why this code let us
        // create the word 'bcdef' instead of 'bdef'.
        if (word && word.occurence == idOccurencePart && element.nodeName.toLowerCase() == 'span') {
          let embeddedWordParts = this.getHightlightEmbeddedWordIdParts(element);
          let embeddedWord = embeddedWordParts ? words[embeddedWordParts[1]] : null;

          if (embeddedWord && embeddedWord.occurence == parseInt(embeddedWordParts[2], 10)) {
            embeddedWord.text += element.childNodes[0].nodeValue || ''; // only immediate text without children.
          }
        }
      }
    });

    if (highlightsCount == 0) {
      this.header.el.style.minHeight = '0';
    }

    let resolvedWords = [];

    _.each(words, (word) => {
      // When possible, take care to find the original term from the query instead of the
      // first highlighted version we encounter. This relies on a recent feature by the
      // Search API, but will fallback properly on older versions.
      word.text = this.resolveOriginalTermFromHighlight(word.text);

      let state = {
        word: word,
        color: word.element.style.backgroundColor,
        currentIndex: 0,
        index: word.index
      };

      this.keywordsState.push(state);
      $$(this.header).append(this.buildWordButton(state, window));

      resolvedWords.push(word.text);
    });

    return resolvedWords;
  }

  private getHighlightIdParts(element: HTMLElement): string[] {
    let parts = element
      .id
      .substr(HIGHLIGHT_PREFIX.length + 1)
      .match(/^([0-9]+)\.([0-9]+)\.([0-9]+)$/);

    return (parts && parts.length > 3) ? parts : null;
  }

  private getHighlightInnerText(element: HTMLElement): string {
    if (element.nodeName.toLowerCase() == 'coveotaggedword') {
      // only immediate text without children.
      return element.childNodes.length >= 1 ? (element.childNodes.item(0).textContent || '') : '';
    } else {
      return element.textContent || '';
    }
  }

  private getHightlightEmbeddedWordIdParts(element: HTMLElement): string[] {
    let embedded = element.getElementsByTagName('coveotaggedword')[0];

    return embedded ? this.getHighlightIdParts(<HTMLElement>embedded) : null;
  }

  private resolveOriginalTermFromHighlight(highlight: string): string {
    let found = highlight;

    // Beware, terms to highlight is only set by recent search APIs.
    if (this.result.termsToHighlight) {
      // We look for the term expansion and we'll return the corresponding
      // original term is one is found.
      found = _.find(_.keys(this.result.termsToHighlight), (originalTerm: string) => {
        // The expansions do NOT include the original term (makes sense), so be sure to check
        // the original term for a match too.
        return (originalTerm.toLowerCase() == highlight.toLowerCase()) ||
          (_.find(this.result.termsToHighlight[originalTerm], (expansion: string) => expansion.toLowerCase() == highlight.toLowerCase()) != undefined);
      }) || found;
    }
    return found;
  }

  private buildWordButton(wordState: IWordState, window: Window): HTMLElement {
    let wordHtml = $$('span');
    wordHtml.addClass('coveo-term-for-quickview');

    let quickviewName = $$('span');
    quickviewName.addClass('coveo-term-for-quickview-name');
    quickviewName.setHtml(wordState.word.text);
    quickviewName.on('click', () => {
      this.navigate(wordState, false, window);
    });
    wordHtml.append(quickviewName.el);

    let quickviewUpArrow = $$('span');
    quickviewUpArrow.addClass('coveo-term-for-quickview-up-arrow');
    let quickviewUpArrowIcon = $$('span');
    quickviewUpArrowIcon.addClass('coveo-term-for-quickview-up-arrow-icon');
    quickviewUpArrow.append(quickviewUpArrowIcon.el);
    quickviewUpArrow.on('click', () => {
      this.navigate(wordState, true, window);
    });
    wordHtml.append(quickviewUpArrow.el);

    let quickviewDownArrow = $$('span');
    quickviewDownArrow.addClass('coveo-term-for-quickview-down-arrow');
    let quickviewDownArrowIcon = $$('span');
    quickviewDownArrowIcon.addClass('coveo-term-for-quickview-down-arrow-icon');
    quickviewDownArrow.append(quickviewDownArrowIcon.el);
    quickviewDownArrow.on('click', () => {
      this.navigate(wordState, false, window);
    });
    wordHtml.append(quickviewDownArrow.el);

    wordHtml.el.style.backgroundColor = wordState.color;
    wordHtml.el.style.borderColor = this.getSaturatedColor(wordState.color);
    quickviewDownArrow.el.style.borderColor = this.getSaturatedColor(wordState.color);

    return wordHtml.el;
  }

  private navigate(state: IWordState, backward: boolean, window: Window) {
    let fromIndex = state.currentIndex;
    let toIndex: number;
    if (!backward) {
      toIndex = fromIndex == state.word.count ? 1 : fromIndex + 1;
    } else {
      toIndex = fromIndex <= 1 ? state.word.count : fromIndex - 1;
    }

    let scroll = this.getScrollingElement(window);

    // Un-highlight any currently selected element
    let current = $$(scroll).find('[id^="' + HIGHLIGHT_PREFIX + ':' + state.word.index + '.' + fromIndex + '"]');
    if (current) {
      current.style.border = '';
    }

    // Find and highlight the new element.
    let element = $$(window.document.body).find('[id^="' + HIGHLIGHT_PREFIX + ':' + state.word.index + '.' + toIndex + '"]');
    element.style.border = '1px dotted #333';
    state.currentIndex = toIndex;

    // pdf2html docs hide the non-visible frames by default, to speed up browsers.
    // But this prevents keyword navigation from working so we must force show it. This
    // is done by adding the 'opened' class to it (defined by pdf2html).
    if (this.isNewQuickviewDocument(window)) {
      let pdf = $$(element).closest('.pc');
      $$(pdf).addClass('opened');
    }

    // pdf2html docs hide the non-visible frames by default, to speed up browsers.
    // Hack for now: the new Quick View is far too complex to manually scroll
    // to the content, so SCREW IT and use good ol' scrollIntoView. I'm planning
    // on a page-based quick view in an upcoming hackaton anyway :)
    //
    // Also, mobile devices have troubles with the animation.
    if (this.isNewQuickviewDocument(window) || DeviceUtils.isMobileDevice()) {
      element.scrollIntoView();

      // iOS on Safari might scroll the whole modal box body when we do this,
      // so give it a nudge in the right direction.
      let body = this.iframe.closest('.coveo-body');
      body.scrollLeft = 0;
      body.scrollTop = 0;

      return;
    }

    // For other quick views we use a nicer animation that centers the keyword

    this.animateScroll(scroll,
      element.offsetLeft - scroll.clientWidth / 2 + $$(element).width() / 2,
      element.offsetTop - scroll.clientHeight / 2 + $$(element).height() / 2);

    this.animateScroll(this.iframe.el,
      element.offsetLeft - this.iframe.width() / 2 + $$(element).width() / 2,
      element.offsetTop - this.iframe.height() / 2 + $$(element).height() / 2);

  }

  private buildHeader(): Dom {
    let header = $$('div');
    header.addClass('coveo-quickview-header');
    return header;
  }

  private buildIFrame(): Dom {
    let iFrame = $$('iframe');
    iFrame.setAttribute('sandbox', 'allow-same-origin');
    let iFrameWrapper = $$('div');
    iFrameWrapper.addClass('coveo-iframeWrapper');
    iFrameWrapper.el.appendChild(iFrame.el);
    return iFrameWrapper;
  }

  private getScrollingElement(iframeWindow: Window): HTMLElement {
    let found: HTMLElement;

    if (this.isNewQuickviewDocument(iframeWindow)) {
      // 'New' quick views have a #page-container element generated by the pdf2html thing.
      // This is the element we want to scroll on.
      found = $$(iframeWindow.document.body).find('#page-container');
    }

    // If all else fails, we use the body
    if (!found) {
      found = $$(iframeWindow.document.body).el;
    }

    return found;
  }

  private isNewQuickviewDocument(iframeWindow: Window): boolean {
    let meta = $$(iframeWindow.document.head).find('meta[name=\'generator\']');
    return meta && meta.getAttribute('content') == 'pdf2htmlEX';
  }

  private handleTermsToHighlight(termsToHighlight: Array<string>, queryObject: IQuery) {
    for (let term in this.result.termsToHighlight) {
      delete this.result.termsToHighlight[term];
    }
    let query = '';
    _.each(termsToHighlight, (term) => {
      query += term + ' ';
      this.result.termsToHighlight[term] = new Array<string>(term);
    });
    query = query.substring(0, query.length - 1);
    queryObject.q = query;
  }

  private checkIfTermsToHighlightWereModified(termsToHighlight: Array<string>) {
    if (!Utils.arrayEqual(termsToHighlight, _.keys(this.result.termsToHighlight))) {
      this.termsToHighlightWereModified = true;
    }
  }

  private getSaturatedColor(color: string): string {
    let r = parseInt(color.substring(4, 7));
    let g = parseInt(color.substring(9, 12));
    let b = parseInt(color.substring(14, 17));
    let hsv = ColorUtils.rgbToHsv(r, g, b);
    hsv[1] *= 2;
    if (hsv[1] > 1) {
      hsv[1] = 1;
    }
    let rgb = ColorUtils.hsvToRgb(hsv[0], hsv[1], hsv[2]);
    return 'rgb(' + rgb[0].toString() + ', ' + rgb[1].toString() + ', ' + rgb[2].toString() + ')';
  }

  private animateScroll(scroll: HTMLElement, scrollLeftValue: number, scrollTopValue: number, duration: number = 100) {
    let leftStep = Math.round((scrollLeftValue - scroll.scrollLeft) / duration);
    let topStep = Math.round((scrollTopValue - scroll.scrollTop) / duration);

    let interval = setInterval(function () {
      if (duration != 0) {
        scroll.scrollLeft += leftStep;
        scroll.scrollTop += topStep;
        duration -= 1;
      } else {
        clearInterval(interval);
      }
    }, 1);
  }
}

Initialization.registerAutoCreateComponent(QuickviewDocument);
