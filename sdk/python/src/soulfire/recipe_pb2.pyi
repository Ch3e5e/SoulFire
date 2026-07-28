from google.api import annotations_pb2 as _annotations_pb2
from google.api import field_behavior_pb2 as _field_behavior_pb2
from soulfire import api_docs_pb2 as _api_docs_pb2
from soulfire import bot_live_pb2 as _bot_live_pb2
from soulfire import common_pb2 as _common_pb2
from soulfire import domain_pb2 as _domain_pb2
from soulfire import inventory_pb2 as _inventory_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class IngredientChoice(_message.Message):
    __slots__ = ("item_ids", "tags", "count")
    ITEM_IDS_FIELD_NUMBER: _ClassVar[int]
    TAGS_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    item_ids: _containers.RepeatedScalarFieldContainer[str]
    tags: _containers.RepeatedScalarFieldContainer[str]
    count: int
    def __init__(self, item_ids: _Optional[_Iterable[str]] = ..., tags: _Optional[_Iterable[str]] = ..., count: _Optional[int] = ...) -> None: ...

class RecipeSnapshot(_message.Message):
    __slots__ = ("recipe_id", "recipe_type", "group", "ingredients", "result", "experience", "cooking_time_ticks", "special")
    RECIPE_ID_FIELD_NUMBER: _ClassVar[int]
    RECIPE_TYPE_FIELD_NUMBER: _ClassVar[int]
    GROUP_FIELD_NUMBER: _ClassVar[int]
    INGREDIENTS_FIELD_NUMBER: _ClassVar[int]
    RESULT_FIELD_NUMBER: _ClassVar[int]
    EXPERIENCE_FIELD_NUMBER: _ClassVar[int]
    COOKING_TIME_TICKS_FIELD_NUMBER: _ClassVar[int]
    SPECIAL_FIELD_NUMBER: _ClassVar[int]
    recipe_id: str
    recipe_type: str
    group: str
    ingredients: _containers.RepeatedCompositeFieldContainer[IngredientChoice]
    result: _domain_pb2.ItemStackSnapshot
    experience: float
    cooking_time_ticks: int
    special: bool
    def __init__(self, recipe_id: _Optional[str] = ..., recipe_type: _Optional[str] = ..., group: _Optional[str] = ..., ingredients: _Optional[_Iterable[_Union[IngredientChoice, _Mapping]]] = ..., result: _Optional[_Union[_domain_pb2.ItemStackSnapshot, _Mapping]] = ..., experience: _Optional[float] = ..., cooking_time_ticks: _Optional[int] = ..., special: bool = ...) -> None: ...

class ListRecipesRequest(_message.Message):
    __slots__ = ("result_item_id", "ingredient", "recipe_types", "page_size", "page_token", "scope")
    RESULT_ITEM_ID_FIELD_NUMBER: _ClassVar[int]
    INGREDIENT_FIELD_NUMBER: _ClassVar[int]
    RECIPE_TYPES_FIELD_NUMBER: _ClassVar[int]
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    result_item_id: str
    ingredient: _inventory_pb2.ItemSelector
    recipe_types: _containers.RepeatedScalarFieldContainer[str]
    page_size: int
    page_token: str
    scope: _inventory_pb2.InventoryScope
    def __init__(self, result_item_id: _Optional[str] = ..., ingredient: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., recipe_types: _Optional[_Iterable[str]] = ..., page_size: _Optional[int] = ..., page_token: _Optional[str] = ..., scope: _Optional[_Union[_inventory_pb2.InventoryScope, _Mapping]] = ...) -> None: ...

class ListRecipesResponse(_message.Message):
    __slots__ = ("recipes", "next_page_token", "registry_hash")
    RECIPES_FIELD_NUMBER: _ClassVar[int]
    NEXT_PAGE_TOKEN_FIELD_NUMBER: _ClassVar[int]
    REGISTRY_HASH_FIELD_NUMBER: _ClassVar[int]
    recipes: _containers.RepeatedCompositeFieldContainer[RecipeSnapshot]
    next_page_token: str
    registry_hash: str
    def __init__(self, recipes: _Optional[_Iterable[_Union[RecipeSnapshot, _Mapping]]] = ..., next_page_token: _Optional[str] = ..., registry_hash: _Optional[str] = ...) -> None: ...

class CanCraftRequest(_message.Message):
    __slots__ = ("scope", "recipe_id", "count")
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    RECIPE_ID_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    scope: _inventory_pb2.InventoryScope
    recipe_id: str
    count: int
    def __init__(self, scope: _Optional[_Union[_inventory_pb2.InventoryScope, _Mapping]] = ..., recipe_id: _Optional[str] = ..., count: _Optional[int] = ...) -> None: ...

class MissingIngredient(_message.Message):
    __slots__ = ("ingredient", "available", "missing")
    INGREDIENT_FIELD_NUMBER: _ClassVar[int]
    AVAILABLE_FIELD_NUMBER: _ClassVar[int]
    MISSING_FIELD_NUMBER: _ClassVar[int]
    ingredient: IngredientChoice
    available: int
    missing: int
    def __init__(self, ingredient: _Optional[_Union[IngredientChoice, _Mapping]] = ..., available: _Optional[int] = ..., missing: _Optional[int] = ...) -> None: ...

class CanCraftResponse(_message.Message):
    __slots__ = ("can_craft", "maximum_craft_count", "missing", "required_station")
    CAN_CRAFT_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_CRAFT_COUNT_FIELD_NUMBER: _ClassVar[int]
    MISSING_FIELD_NUMBER: _ClassVar[int]
    REQUIRED_STATION_FIELD_NUMBER: _ClassVar[int]
    can_craft: bool
    maximum_craft_count: int
    missing: _containers.RepeatedCompositeFieldContainer[MissingIngredient]
    required_station: str
    def __init__(self, can_craft: bool = ..., maximum_craft_count: _Optional[int] = ..., missing: _Optional[_Iterable[_Union[MissingIngredient, _Mapping]]] = ..., required_station: _Optional[str] = ...) -> None: ...

class CraftTask(_message.Message):
    __slots__ = ("recipe_id", "count", "station")
    RECIPE_ID_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    STATION_FIELD_NUMBER: _ClassVar[int]
    recipe_id: str
    count: int
    station: _common_pb2.BlockPosition
    def __init__(self, recipe_id: _Optional[str] = ..., count: _Optional[int] = ..., station: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ...) -> None: ...

class CraftTaskResult(_message.Message):
    __slots__ = ("result", "crafted")
    RESULT_FIELD_NUMBER: _ClassVar[int]
    CRAFTED_FIELD_NUMBER: _ClassVar[int]
    result: _domain_pb2.ItemStackSnapshot
    crafted: int
    def __init__(self, result: _Optional[_Union[_domain_pb2.ItemStackSnapshot, _Mapping]] = ..., crafted: _Optional[int] = ...) -> None: ...

class SmeltTask(_message.Message):
    __slots__ = ("input", "count", "fuel", "station")
    INPUT_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    FUEL_FIELD_NUMBER: _ClassVar[int]
    STATION_FIELD_NUMBER: _ClassVar[int]
    input: _inventory_pb2.ItemSelector
    count: int
    fuel: _inventory_pb2.ItemSelector
    station: _common_pb2.BlockPosition
    def __init__(self, input: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., count: _Optional[int] = ..., fuel: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., station: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ...) -> None: ...

class SmeltTaskResult(_message.Message):
    __slots__ = ("outputs",)
    OUTPUTS_FIELD_NUMBER: _ClassVar[int]
    outputs: _containers.RepeatedCompositeFieldContainer[_domain_pb2.ItemStackSnapshot]
    def __init__(self, outputs: _Optional[_Iterable[_Union[_domain_pb2.ItemStackSnapshot, _Mapping]]] = ...) -> None: ...

class BrewTask(_message.Message):
    __slots__ = ("input", "ingredient", "count", "fuel", "station", "expected_result")
    INPUT_FIELD_NUMBER: _ClassVar[int]
    INGREDIENT_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    FUEL_FIELD_NUMBER: _ClassVar[int]
    STATION_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_RESULT_FIELD_NUMBER: _ClassVar[int]
    input: _inventory_pb2.ItemSelector
    ingredient: _inventory_pb2.ItemSelector
    count: int
    fuel: _inventory_pb2.ItemSelector
    station: _common_pb2.BlockPosition
    expected_result: _inventory_pb2.ItemSelector
    def __init__(self, input: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., ingredient: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., count: _Optional[int] = ..., fuel: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., station: _Optional[_Union[_common_pb2.BlockPosition, _Mapping]] = ..., expected_result: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ...) -> None: ...

class BrewTaskResult(_message.Message):
    __slots__ = ("outputs",)
    OUTPUTS_FIELD_NUMBER: _ClassVar[int]
    outputs: _containers.RepeatedCompositeFieldContainer[_domain_pb2.ItemStackSnapshot]
    def __init__(self, outputs: _Optional[_Iterable[_Union[_domain_pb2.ItemStackSnapshot, _Mapping]]] = ...) -> None: ...

class VillagerTradeOfferSnapshot(_message.Message):
    __slots__ = ("offer_index", "first_cost", "second_cost", "result", "uses", "maximum_uses", "out_of_stock", "rewards_experience", "villager_experience", "demand", "special_price", "price_multiplier")
    OFFER_INDEX_FIELD_NUMBER: _ClassVar[int]
    FIRST_COST_FIELD_NUMBER: _ClassVar[int]
    SECOND_COST_FIELD_NUMBER: _ClassVar[int]
    RESULT_FIELD_NUMBER: _ClassVar[int]
    USES_FIELD_NUMBER: _ClassVar[int]
    MAXIMUM_USES_FIELD_NUMBER: _ClassVar[int]
    OUT_OF_STOCK_FIELD_NUMBER: _ClassVar[int]
    REWARDS_EXPERIENCE_FIELD_NUMBER: _ClassVar[int]
    VILLAGER_EXPERIENCE_FIELD_NUMBER: _ClassVar[int]
    DEMAND_FIELD_NUMBER: _ClassVar[int]
    SPECIAL_PRICE_FIELD_NUMBER: _ClassVar[int]
    PRICE_MULTIPLIER_FIELD_NUMBER: _ClassVar[int]
    offer_index: int
    first_cost: _domain_pb2.ItemStackSnapshot
    second_cost: _domain_pb2.ItemStackSnapshot
    result: _domain_pb2.ItemStackSnapshot
    uses: int
    maximum_uses: int
    out_of_stock: bool
    rewards_experience: bool
    villager_experience: int
    demand: int
    special_price: int
    price_multiplier: float
    def __init__(self, offer_index: _Optional[int] = ..., first_cost: _Optional[_Union[_domain_pb2.ItemStackSnapshot, _Mapping]] = ..., second_cost: _Optional[_Union[_domain_pb2.ItemStackSnapshot, _Mapping]] = ..., result: _Optional[_Union[_domain_pb2.ItemStackSnapshot, _Mapping]] = ..., uses: _Optional[int] = ..., maximum_uses: _Optional[int] = ..., out_of_stock: bool = ..., rewards_experience: bool = ..., villager_experience: _Optional[int] = ..., demand: _Optional[int] = ..., special_price: _Optional[int] = ..., price_multiplier: _Optional[float] = ...) -> None: ...

class ListVillagerTradesRequest(_message.Message):
    __slots__ = ("scope",)
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    scope: _inventory_pb2.InventoryScope
    def __init__(self, scope: _Optional[_Union[_inventory_pb2.InventoryScope, _Mapping]] = ...) -> None: ...

class ListVillagerTradesResponse(_message.Message):
    __slots__ = ("offers", "villager_level", "villager_experience", "can_restock", "container_id", "container_revision")
    OFFERS_FIELD_NUMBER: _ClassVar[int]
    VILLAGER_LEVEL_FIELD_NUMBER: _ClassVar[int]
    VILLAGER_EXPERIENCE_FIELD_NUMBER: _ClassVar[int]
    CAN_RESTOCK_FIELD_NUMBER: _ClassVar[int]
    CONTAINER_ID_FIELD_NUMBER: _ClassVar[int]
    CONTAINER_REVISION_FIELD_NUMBER: _ClassVar[int]
    offers: _containers.RepeatedCompositeFieldContainer[VillagerTradeOfferSnapshot]
    villager_level: int
    villager_experience: int
    can_restock: bool
    container_id: int
    container_revision: int
    def __init__(self, offers: _Optional[_Iterable[_Union[VillagerTradeOfferSnapshot, _Mapping]]] = ..., villager_level: _Optional[int] = ..., villager_experience: _Optional[int] = ..., can_restock: bool = ..., container_id: _Optional[int] = ..., container_revision: _Optional[int] = ...) -> None: ...

class VillagerTradeTask(_message.Message):
    __slots__ = ("offer_index", "count", "expected_result", "close_when_done")
    OFFER_INDEX_FIELD_NUMBER: _ClassVar[int]
    COUNT_FIELD_NUMBER: _ClassVar[int]
    EXPECTED_RESULT_FIELD_NUMBER: _ClassVar[int]
    CLOSE_WHEN_DONE_FIELD_NUMBER: _ClassVar[int]
    offer_index: int
    count: int
    expected_result: _inventory_pb2.ItemSelector
    close_when_done: bool
    def __init__(self, offer_index: _Optional[int] = ..., count: _Optional[int] = ..., expected_result: _Optional[_Union[_inventory_pb2.ItemSelector, _Mapping]] = ..., close_when_done: bool = ...) -> None: ...

class VillagerTradeTaskResult(_message.Message):
    __slots__ = ("outputs", "completed_trades")
    OUTPUTS_FIELD_NUMBER: _ClassVar[int]
    COMPLETED_TRADES_FIELD_NUMBER: _ClassVar[int]
    outputs: _containers.RepeatedCompositeFieldContainer[_domain_pb2.ItemStackSnapshot]
    completed_trades: int
    def __init__(self, outputs: _Optional[_Iterable[_Union[_domain_pb2.ItemStackSnapshot, _Mapping]]] = ..., completed_trades: _Optional[int] = ...) -> None: ...
