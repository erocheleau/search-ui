import {IQueryResult} from '../../rest/QueryResult';
import {Component} from '../Base/Component';
import {SortCriteria} from '../Sort/SortCriteria';
import {ComponentOptions, IFieldOption} from '../Base/ComponentOptions';
import {IComponentBindings} from '../Base/ComponentBindings';
import {Utils} from '../../utils/Utils';
import {Assert} from '../../misc/Assert';
import {QueryEvents, IBuildingQueryEventArgs, IPreprocessResultsEventArgs} from '../../events/QueryEvents';
import {Initialization} from '../Base/Initialization';
import {IQueryResults} from '../../rest/QueryResults';
import {IQuery} from '../../rest/Query';
import {$$} from '../../utils/Dom';
import {QueryBuilder} from '../Base/QueryBuilder';

export interface IFoldingOptions {
  field?: IFieldOption;

  childField?: IFieldOption;
  parentField?: IFieldOption;

  range?: number;
  rearrange?: SortCriteria;

  enableExpand?: boolean;
  expandExpression?: string;
  maximumExpandedResults?: number;

  /**
   * Manage folding for each results individually
   */
  getResult?: (result: IQueryResult) => IQueryResult;
  /**
   * Manage folding of all more results
   */
  getMoreResults?: (results: IQueryResult[]) => IQueryResult[];
}

interface IResultNode {
  score: number;
  parent?: IResultNode;
  result: IQueryResult;
  children: IResultNode[];
}

/**
 * This component is used to display search results that share a common field hierarchically.
 * It is typically used to display email conversations and message board threads.
 * The different messages in a given conversation typically have a unique conversation ID.
 * Given that this ID is indexed in a field, you can use it to fold search results
 */
export class Folding extends Component {
  static ID = 'Folding';
  /**
   * The options for the component
   * @componentOptions
   */
  static options: IFoldingOptions = {
    /**
     * The name of the field on which the folding is done.<br/>
     * This option is required.
     */
    field: ComponentOptions.buildFieldOption({ required: true }),
    /**
     * Specifies the field that determines that a result is a child of another top result.<br/>
     * The default value is `@topparentid`.
     */
    childField: ComponentOptions.buildFieldOption({ defaultValue: '@topparentid' }),
    /**
     * Specifies the field that determines if a result is a top result containing other child results.<br/>
     * The default value is `@syscontainsattachment`.
     */
    parentField: ComponentOptions.buildFieldOption({ defaultValue: '@containsattachment' }),
    /**
     * The number of child results to fold.
     *
     * The default value is 2.
     *
     * The minimum value is 0.
     *
     * > Example:
     * > For an email thread with 20 messages in total, using the default value means that a maximum of 2 child messages are loaded and displayed under the original message (unless the whole conversation is expanded via the use of a Show all conversation button).
     */
    range: ComponentOptions.buildNumberOption({ defaultValue: 2, min: 0 }),
    /**
     * Specifies the top result and its related child results, following the sort criteria format
     * (`date ascending`, `@somefield ascending`, etc.)
     *
     * The default value is `none`, which means that results are displayed in the order that the index returned them.
     *
     * > Example:
     * > If you specify date descending, the component re-arranges an email conversation so that the newest email is always the top result. Doing the opposite would allow the original email to always be the top result since it is also the oldest.
     */
    rearrange: ComponentOptions.buildCustomOption((value) => Utils.isNonEmptyString(value) ? SortCriteria.parse(value) : null),
    /**
     * Specifies whether to add a callback function on the top result, allowing to make an additional query.
     * to load all the conversation of a given thread.
     *
     * Concretely, the {@link ResultFolding} component uses this for its <b>Load full conversation</b> option.
     *
     * The default value is `true`.
     */
    enableExpand: ComponentOptions.buildBooleanOption({ defaultValue: true }),
    /**
     * Specifies a customized constant expression to send when querying the expanded results.
     */
    expandExpression: ComponentOptions.buildStringOption({ depend: 'enableExpand' }),
    /**
     * Specifies the maximum number of expanded results.
     *
     * The default value is 100.
     *
     * The minimum value is 1.
     */
    maximumExpandedResults: ComponentOptions.buildNumberOption({ defaultValue: 100, min: 1, depend: 'enableExpand' }),
    /**
     * This function manages folding individually for each result.
     *
     * The default value (which is implemented in Coveo.Folding.defaultGetResult):
     *
     * ```
     * var results = result.childResults || [];
     * // Add the top result at the top of the list
     * results.unshift(result);
     * // Empty childResults just to clean it
     * result.childResults = [];
     * // Fold those results
     * results = Coveo.Folding.foldWithParent(results);
     * // The first result is the top one
     * var topResult = results.shift();
     * // All other results are childResults
     * topResult.childResults = results;
     * return topResult;
     * ```
     *
     * You can preprocess all the result with this option:
     * ```
     * Coveo.init(document.querySelector('#search'), {
     *    Folding: {
     *      getResult: function(result) {
     *        result = Coveo.Folding.defaultGetResult(result);
     *        // Your code here
     *      }
     *    }
     * })
     *
     * // OR using the jQuery extension
     *
     * Coveo.$('#search').coveo('init', {
     *    Folding: {
     *      getResult: function(result) {
     *        result = Coveo.Folding.defaultGetResult(result);
     *        // Your code here
     *      }
     *    }
     * });
     * ```
     */
    getResult: ComponentOptions.buildCustomOption<(result: IQueryResult) => IQueryResult>(() => {
      return null;
    }),
    /**
     * This function manages folding of all results.
     *
     * The default value (Coveo.Folding.defaultGetMoreResults):
     *
     * ```
     * Coveo.Folding.defaultGetMoreResults = function(results) {
     *    // The results are flat, just do the folding
     *    return Coveo.Folding.foldWithParent(results);
     * }
     * ```
     *
     */
    getMoreResults: ComponentOptions.buildCustomOption<(results: IQueryResult[]) => IQueryResult[]>(() => {
      return null;
    })
  };

  /**
   * Create a new Folding component
   * @param element
   * @param options
   * @param bindings
   */
  constructor(public element: HTMLElement, public options: IFoldingOptions, bindings?: IComponentBindings) {
    super(element, Folding.ID, bindings);

    this.options = ComponentOptions.initComponentOptions(element, Folding, options);

    Assert.check(Utils.isCoveoField(<string>this.options.field), this.options.field + ' is not a valid field');
    Assert.exists(this.options.maximumExpandedResults);

    this.bind.onRootElement(QueryEvents.buildingQuery, this.handleBuildingQuery);
    this.bind.onRootElement(QueryEvents.preprocessResults, this.handlepreprocessResults);
  }

  // From a list of results, return a list of results and their attachments
  // We use parentResult to build a tree of result
  static foldWithParent(queryResults: IQueryResult[]): IQueryResult[] {
    let rootNode: IResultNode = {
      score: Number.NEGATIVE_INFINITY,
      children: [],
      result: <IQueryResult>{
        raw: false
      }
    };

    _.each(queryResults, (queryResult: IQueryResult, i: number) => {
      let resultNode = Folding.findUniqueId(rootNode.children, queryResult.uniqueId);
      // If he have no parent or is parent is him self, add it to the root
      if (queryResult.parentResult == null || queryResult.parentResult.uniqueId == queryResult.uniqueId) {
        // Add it only if he do not exist
        if (resultNode == null) {
          resultNode = {
            result: queryResult,
            score: i,
            children: []
          };
          rootNode.children.push(resultNode);
          resultNode.parent = rootNode;
        }
      } else {
        // If the resultNode already exist
        if (resultNode != null) {
          resultNode.score = Math.min(i, resultNode.score);
          // Remove himself from his parent because it will be added in his parent. This allowed to remove duplicate.
          resultNode.parent.children = _.without(resultNode.parent.children, resultNode);
        } else {
          resultNode = {
            result: queryResult,
            score: i,
            children: []
          };
        }

        let parentResult = Folding.findUniqueId(rootNode.children, queryResult.parentResult.uniqueId);
        // If the parent does not already exist, create it and add it the root
        if (parentResult == null) {
          parentResult = {
            result: queryResult.parentResult,
            score: Number.POSITIVE_INFINITY,
            children: []
          };
          rootNode.children.push(parentResult);
          parentResult.parent = rootNode;
        }
        // Add the resultNode to parent
        parentResult.children.push(resultNode);
        resultNode.parent = parentResult;
        let parent = parentResult;
        while (parent != null && resultNode.score < parent.score) {
          parent.score = resultNode.score;
          parent = parent.parent;
        }
      }
    });
    let rootResult = Folding.resultNodeToQueryResult(rootNode);
    // Remove the root from all results
    _.each(rootResult.attachments, (attachment) => attachment.parentResult = null);
    return rootResult.attachments;
  }

  // 99.9% of the folding case will be alright with those default functions.
  // Otherwise use the options getResult and getMoreResults
  public static defaultGetResult(result: IQueryResult) {
    let results: IQueryResult[] = result.childResults || [];
    // Add the top result at the top of the list
    results.unshift(result);
    // Empty childResults just to make it more clean
    result.childResults = [];
    // Fold those results
    results = Folding.foldWithParent(results);
    // The first result is the top one
    let topResult = results.shift();
    // All other the results are childResults
    topResult.childResults = results;
    return topResult;
  }

  public static defaultGetMoreResults(results: IQueryResult[]) {
    // The result are flat, just do the fold
    return Folding.foldWithParent(results);
  }

  // Convert ResultNode to QueryResult
  private static resultNodeToQueryResult(resultNode: IResultNode): IQueryResult {
    let result = resultNode.result;
    result.attachments = _.map(_.sortBy<IResultNode>(resultNode.children, 'score'), Folding.resultNodeToQueryResult);
    result.parentResult = resultNode.parent != null ? resultNode.parent.result : null;
    return result;
  }

  private static findUniqueId(resultNodes: IResultNode[], uniqueId: string): IResultNode {
    for (let i = 0; i < resultNodes.length; i++) {
      if (resultNodes[i].result.uniqueId == uniqueId) {
        return resultNodes[i];
      }
      let resultNode = Folding.findUniqueId(resultNodes[i].children, uniqueId);
      if (resultNode != null) {
        return resultNode;
      }
    }
    return null;
  }


  private handleBuildingQuery(data: IBuildingQueryEventArgs) {
    Assert.exists(data);

    if (!this.disabled) {
      data.queryBuilder.childField = <string>this.options.childField;
      data.queryBuilder.parentField = <string>this.options.parentField;
      data.queryBuilder.filterField = <string>this.options.field;
      data.queryBuilder.filterFieldRange = this.options.range;

      data.queryBuilder.requiredFields.push(<string>this.options.field);
      if (this.options.childField != null) {
        data.queryBuilder.requiredFields.push(<string>this.options.childField);
      }
      if (this.options.parentField != null) {
        data.queryBuilder.requiredFields.push(<string>this.options.parentField);
      }
    }
  }

  private handlepreprocessResults(data: IPreprocessResultsEventArgs) {
    Assert.exists(data);
    Assert.check(!data.results._folded, 'Two folding component are active at the same time for the same tab. Can\'t process result !');
    data.results._folded = true;

    let queryResults = data.results;

    let getResult: (result: IQueryResult) => IQueryResult = this.options.getResult || Folding.defaultGetResult;
    queryResults.results = _.map(queryResults.results, getResult);
    this.addLoadMoreHandler(<IQueryResult[]>queryResults.results, data.query);
  }

  private addLoadMoreHandler(results: IQueryResult[], originalQuery: IQuery) {
    return _.map(results, (result) => {
      if (this.options.enableExpand && !Utils.isNullOrUndefined(Utils.getFieldValue(result, <string>this.options.field))) {
        result.moreResults = () => {
          return this.moreResults(result, originalQuery);
        };
      }
      return result;
    });
  }


  private moreResults(result: IQueryResult, originalQuery: IQuery): Promise<IQueryResult[]> {
    let query = new QueryBuilder();
    query.numberOfResults = this.options.maximumExpandedResults;

    let fieldValue = Utils.getFieldValue(result, <string>this.options.field);

    if (Utils.isNonEmptyString(fieldValue)) {
      query.advancedExpression.addFieldExpression(<string>this.options.field, '=', [fieldValue]);
    }

    if (Utils.isNonEmptyString(originalQuery.q)) {
      // We add keywords to get the highlight and we add @uri to get all results
      query.expression.add('(' + originalQuery.q + ') OR @uri');
    }

    if (Utils.isNonEmptyString(this.options.expandExpression)) {
      query.constantExpression.add(this.options.expandExpression);
    }

    if (this.options.parentField != null) {
      query.parentField = <string>this.options.parentField;
    }
    if (this.options.childField != null) {
      query.childField = <string>this.options.childField;
    }

    if (this.options.rearrange) {
      this.options.rearrange.putInQueryBuilder(query);
    } else {
      query.sortCriteria = originalQuery.sortCriteria;
      query.sortField = originalQuery.sortField;
    }

    let builtQuery = query.build();
    return this.queryController.getEndpoint().search(builtQuery)
      .then((results: IQueryResults) => {
        this.handlePreprocessMoreResults(results);
        return results.results;
      });
  }

  private handlePreprocessMoreResults(queryResults: IQueryResults) {
    let getResults: (results: IQueryResult[]) => IQueryResult[] = this.options.getMoreResults || Folding.defaultGetMoreResults;
    queryResults.results = getResults(queryResults.results);
    $$(this.element).trigger(QueryEvents.preprocessMoreResults, {
      results: queryResults
    });
  }
}

Initialization.registerAutoCreateComponent(Folding);
