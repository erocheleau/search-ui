/// <reference path='../ui/Facet/Facet.ts' />

import {Facet} from '../ui/Facet/Facet';
import {IGroupByRequest} from '../rest/GroupByRequest';
import {IGroupByResult} from '../rest/GroupByResult';
import {ExpressionBuilder} from '../ui/Base/ExpressionBuilder';
import {FacetValue} from '../ui/Facet/FacetValues';
import {Utils} from '../utils/Utils';
import {QueryBuilder} from '../ui/Base/QueryBuilder';
import {FacetSearchParameters} from '../ui/Facet/FacetSearchParameters';
import {Assert} from '../misc/Assert';
import {IIndexFieldValue} from '../rest/FieldValue';
import {FacetUtils} from '../ui/Facet/FacetUtils';
import {IQueryResults} from '../rest/QueryResults';
import {IGroupByValue} from '../rest/GroupByValue';
import {IEndpointError} from '../rest/EndpointError';
import {IQueryBuilderExpression} from '../ui/Base/QueryBuilder';

export class FacetQueryController {
  public expressionToUseForFacetSearch: string;
  public constantExpressionToUseForFacetSearch: string;
  public lastGroupByRequestIndex: number;
  public lastGroupByRequest: IGroupByRequest;
  public lastGroupByResult: IGroupByResult;

  constructor(public facet: Facet) {
  }

  /**
   * Reset the expression for the facet search, used when a new query is triggered
   */
  public prepareForNewQuery() {
    this.lastGroupByRequestIndex = undefined;
    this.expressionToUseForFacetSearch = undefined;
    this.constantExpressionToUseForFacetSearch = undefined;
  }

  /**
   * Compute the filter expression that the facet need to output for the query
   * @returns {string}
   */
  public computeOurFilterExpression(): string {
    let builder = new ExpressionBuilder();
    let selected = this.facet.values.getSelected();
    if (selected.length > 0) {
      if (this.facet.options.useAnd) {
        _.each(selected, (value: FacetValue) => {
          builder.addFieldExpression(<string>this.facet.options.field, '==', [value.value]);
        });
      } else {
        builder.addFieldExpression(<string>this.facet.options.field, '==', _.map(selected, (value: FacetValue) => value.value));
      }
    }
    let excluded = this.facet.values.getExcluded();
    if (excluded.length > 0) {
      builder.addFieldNotEqualExpression(<string>this.facet.options.field, _.map(excluded, (value: FacetValue) => value.value));
    }
    if (Utils.isNonEmptyString(this.facet.options.additionalFilter)) {
      builder.add(this.facet.options.additionalFilter);
    }
    return builder.build();
  }

  /**
   * Build the group by request for the facet, and insert it in the query builder
   * @param queryBuilder
   */
  public putGroupByIntoQueryBuilder(queryBuilder: QueryBuilder) {
    Assert.exists(queryBuilder);

    let allowedValues = this.createGroupByAllowedValues();
    let groupByRequest = this.createBasicGroupByRequest(allowedValues);

    let queryOverrideObject = this.createGroupByQueryOverride(queryBuilder);
    if (!Utils.isNullOrUndefined(queryOverrideObject)) {
      groupByRequest.queryOverride = queryOverrideObject.basic;
      groupByRequest.advancedQueryOverride = queryOverrideObject.advanced;
      groupByRequest.constantQueryOverride = queryOverrideObject.constant;
      this.expressionToUseForFacetSearch = queryOverrideObject.withoutConstant;
      this.constantExpressionToUseForFacetSearch = queryOverrideObject.constant;
    } else {
      let parts = queryBuilder.computeCompleteExpressionParts();
      this.expressionToUseForFacetSearch = parts.withoutConstant;
      if (this.expressionToUseForFacetSearch == null) {
        this.expressionToUseForFacetSearch = '@uri';
      }
      this.constantExpressionToUseForFacetSearch = parts.constant;
    }
    this.lastGroupByRequestIndex = queryBuilder.groupByRequests.length;
    this.lastGroupByRequest = groupByRequest;
    queryBuilder.groupByRequests.push(groupByRequest);
  }

  /**
   * Search inside the facet, using a group by request
   * @param params
   * @param oldLength Optional params, used by the search method to call itself recursively to fetch all required values
   * @returns {Promise|Promise<T>}
   */
  public search(params: FacetSearchParameters, oldLength = params.nbResults): Promise<IIndexFieldValue[]> {

    return new Promise((resolve, reject) => {
      let onResult = (fieldValues?: IIndexFieldValue[]) => {
        let newLength = fieldValues.length;
        fieldValues = this.checkForFacetSearchValuesToRemove(fieldValues, params.valueToSearch);
        if (FacetUtils.needAnotherFacetSearch(fieldValues.length, newLength, oldLength, 5)) {
          // This means that we removed enough values from the returned one that we need to perform a new search with more values requested.
          params.nbResults += 5;
          return this.search(params, fieldValues.length);
        } else {
          resolve(fieldValues);
        }
      };

      this.facet.getEndpoint().search(params.getQuery())
        .then((queryResults: IQueryResults) => {
          if (this.facet.searchInterface.isNewDesign()) {
            // params.getQuery() will generate a query for all excluded values + some new values
            // there is no clean way to do a group by and remove some values
            // so instead we request more values than we need, and crop all the one we don't want
            let valuesCropped: IGroupByValue[] = [];
            if (queryResults.groupByResults && queryResults.groupByResults[0]) {
              _.each(queryResults.groupByResults[0].values, (v: IGroupByValue) => {
                if (v.lookupValue) {
                  if (!_.contains(params.alwaysExclude, v.lookupValue.toLowerCase())) {
                    valuesCropped.push(v);
                  }
                } else {
                  if (!_.contains(params.alwaysExclude, v.value.toLowerCase())) {
                    valuesCropped.push(v);
                  }
                }
              });
            }
            onResult(_.first(valuesCropped, params.nbResults));
          } else {
            resolve(queryResults.groupByResults[0].values);
          }
        })
        .catch((error: IEndpointError) => {
          reject(error);
        });
    });
  }

  public fetchMore(numberOfValuesToFetch: number) {
    let params = new FacetSearchParameters(this.facet);
    params.alwaysInclude = this.facet.options.allowedValues || _.pluck(this.facet.values.getAll(), 'value');
    params.nbResults = numberOfValuesToFetch;
    return this.facet.getEndpoint().search(params.getQuery());
  }

  public searchInFacetToUpdateDelta(facetValues: FacetValue[]) {
    let params = new FacetSearchParameters(this.facet);
    let query = params.getQuery();
    query.aq = this.computeOurFilterExpression();
    _.each(facetValues, (facetValue: FacetValue) => {
      facetValue.waitingForDelta = true;
    });
    query.groupBy = [this.createBasicGroupByRequest(_.map(facetValues, (facetValue: FacetValue) => facetValue.value))];
    query.groupBy[0].completeFacetWithStandardValues = false;
    return this.facet.getEndpoint().search(query);
  }

  protected createGroupByAllowedValues() {
    // if you want to keep displayed values next time, take all current values as allowed values
    // otherwise take only the selected value
    if (this.facet.options.allowedValues != undefined) {
      return this.facet.options.allowedValues;
    } else if (this.facet.options.customSort != undefined) {
      // If there is a custom sort, we still need to add selectedValues to the group by
      // Filter out duplicates with a lower case comparison on the value
      let toCompare = _.map(this.facet.options.customSort, (val: string) => {
        return val.toLowerCase();
      });
      let filtered = _.filter(this.getAllowedValuesFromSelected(), (value: string) => {
        return !_.contains(toCompare, value.toLowerCase());
      });
      return this.facet.options.customSort.concat(filtered);

    } else {
      return this.getAllowedValuesFromSelected();
    }
  }

  private getAllowedValuesFromSelected() {
    let toMap: FacetValue[] = [];
    if (this.facet.options.useAnd || !this.facet.keepDisplayedValuesNextTime) {
      let selected = this.facet.values.getSelected();
      if (selected.length == 0) {
        return undefined;
      }
      toMap = this.facet.values.getSelected();
    } else {
      toMap = this.facet.values.getAll();
    }
    return _.map(toMap, (facetValue: FacetValue) => facetValue.value);
  }

  private createGroupByQueryOverride(queryBuilder: QueryBuilder): IQueryBuilderExpression {
    let additionalFilter = this.facet.options.additionalFilter ? this.facet.options.additionalFilter : '';
    let queryOverrideObject: IQueryBuilderExpression = undefined;

    if (this.facet.options.useAnd) {
      if (Utils.isNonEmptyString(additionalFilter)) {
        queryOverrideObject = queryBuilder.computeCompleteExpressionParts();
        if (Utils.isEmptyString(queryOverrideObject.basic)) {
          queryOverrideObject.basic = '@uri';
        }
      }
    } else {
      if (this.facet.values.hasSelectedOrExcludedValues()) {
        queryOverrideObject = queryBuilder.computeCompleteExpressionPartsExcept(this.computeOurFilterExpression());
        if (Utils.isEmptyString(queryOverrideObject.basic)) {
          queryOverrideObject.basic = '@uri';
        }
      } else {
        if (Utils.isNonEmptyString(additionalFilter)) {
          queryOverrideObject = queryBuilder.computeCompleteExpressionParts();
          if (Utils.isEmptyString(queryOverrideObject.basic)) {
            queryOverrideObject.basic = '@uri';
          }
        }
      }
    }

    if (queryOverrideObject) {
      if (Utils.isNonEmptyString(additionalFilter)) {
        queryOverrideObject.constant = queryOverrideObject.constant ? queryOverrideObject.constant + ' ' + additionalFilter : additionalFilter;
      }
    }
    _.each(_.keys(queryOverrideObject), (k) => {
      if (Utils.isEmptyString(queryOverrideObject[k]) || Utils.isNullOrUndefined(queryOverrideObject[k])) {
        delete queryOverrideObject[k];
      }
    });
    if (_.keys(queryOverrideObject).length == 0) {
      queryOverrideObject = undefined;
    }
    return queryOverrideObject;
  }

  protected createBasicGroupByRequest(allowedValues?: string[], addComputedField: boolean = true): IGroupByRequest {
    let nbOfRequestedValues = this.facet.numberOfValues;
    if (this.facet.options.customSort != null) {
      let usedValues = _.union(_.map(this.facet.values.getSelected(), (facetValue: FacetValue) => facetValue.value), _.map(this.facet.values.getExcluded(), (facetValue: FacetValue) => facetValue.value), this.facet.options.customSort);
      nbOfRequestedValues = Math.max(nbOfRequestedValues, usedValues.length);
    }

    let groupByRequest: IGroupByRequest = {
      field: <string>this.facet.options.field,
      maximumNumberOfValues: nbOfRequestedValues + (this.facet.options.enableMoreLess ? 1 : 0),
      sortCriteria: this.facet.options.sortCriteria,
      injectionDepth: this.facet.options.injectionDepth,
      completeFacetWithStandardValues: this.facet.options.allowedValues == undefined ? true : false
    };
    if (this.facet.options.lookupField) {
      groupByRequest.lookupField = <string>this.facet.options.lookupField;
    }
    if (allowedValues != null) {
      groupByRequest.allowedValues = allowedValues;
    }

    if (addComputedField && Utils.isNonEmptyString(<string>this.facet.options.computedField)) {
      groupByRequest.computedFields = [{
        field: <string>this.facet.options.computedField,
        operation: this.facet.options.computedFieldOperation
      }];
    }
    return groupByRequest;
  }

  private checkForFacetSearchValuesToRemove(fieldValues: IIndexFieldValue[], valueToCheckAgainst: string) {
    let regex = FacetUtils.getRegexToUseForFacetSearch(valueToCheckAgainst, this.facet.options.facetSearchIgnoreAccents);

    return _.filter<IIndexFieldValue>(fieldValues, (fieldValue) => {
      let isAllowed =
        _.isEmpty(this.facet.options.allowedValues) ||
        _.contains(this.facet.options.allowedValues, fieldValue.value);

      let value = this.facet.getValueCaption(fieldValue);
      return isAllowed && regex.test(value);
    });
  }
}
