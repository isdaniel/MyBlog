---
title: C language implement foreach
date: 2024-04-17 22:30:11
tags: [C,Design-Pattern]
categories: [C#,DesignPattern]
keywords: C, foreach
---

## Foreword

In PostgreSQL, there isn't a native foreach loop construct in C, because C itself doesn't have a foreach loop as you might find in higher-level languages like Python or PHP. However, PostgreSQL often implements loop iterations over elements using **Macros** that simplify the handling of data structures, such as linked lists, which are commonly used within its codebase.

## Common Loop Macros in PostgreSQL

1. `lfirst(lc)`:
   - This macro retrieves the data stored in a `ListCell`. The `ListCell` structure typically contains a union that can hold various types of pointers (like `void*`, `int`, etc.). The `ptr_value` is a generic pointer that can point to any node or structure, and `lfirst` simply casts it back from the `void *`.

2. `lfirst_node(type, lc)`:
   - This macro is used when the list elements are known to be of a specific node type, which is common in the parser and planner where lists often contain specific types of nodes (e.g., expression or plan nodes). `lfirst_node` uses `castNode` to cast the pointer retrieved by `lfirst` to the specified type, ensuring type safety and readability in the code.

3. `castNode(_type_, nodeptr)`:
   - A simple cast to the specified type `_type_`. It enhances readability and ensures that the casting is explicit in the code, which is crucial for understanding that a type conversion is taking place, particularly when navigating complex data structures common in PostgreSQL's internals.

```c
#define lfirst(lc)				((lc)->ptr_value)
#define lfirst_node(type,lc)	castNode(type, lfirst(lc))
#define castNode(_type_, nodeptr) ((_type_ *) (nodeptr))
#define true	1
#define false	0
#define foreach(cell, lst)	\
	for (ForEachState cell##__state = {(lst), 0}; \
		 (cell##__state.l != NIL && \
		  cell##__state.i < cell##__state.l->length) ? \
		 (cell = &cell##__state.l->elements[cell##__state.i], true) : \
		 (cell = NULL, false); \
		 cell##__state.i++)

#define NIL						((List *) NULL)
```

The `ListCell` union consists of a single member, `ptr_value`, which is a generic pointer `(void *)`.

This pointer can hold a reference to any type of data, allowing for flexibility in what kind of data the list can contain.
This structure is useful for managing lists of generic data types.

The List structure represents a dynamic list in PostgreSQL.
It contains:
* `length`: An integer that specifies the current number of elements in the list.
* `elements`: A pointer to an array of `ListCell` elements, which holds the actual data in the list. This array can be re-allocated as the list grows or shrinks, allowing for dynamic resizing.
* The comment suggests that sometimes `ListCell` elements may be allocated directly alongside the List structure itself. This can optimize memory usage and improve performance.

```c
typedef union ListCell
{
	void	   *ptr_value;
} ListCell;

typedef struct List
{
	int			length;			/* number of elements currently present */
	ListCell   *elements;		/* re-allocatable array of cells */
} List;
```
The ForEachState structure is used to manage state while iterating over a list in PostgreSQL.

* `l`: A constant pointer to the list being iterated. The list is not meant to be modified during iteration.
* `i`: An integer tracking the current index of the element in the list being processed. This helps keep track of the iteration progress.

These structures work together to handle lists of data in PostgreSQL, providing the flexibility to work with generic data types and iterate over lists efficiently and safely. The List structure allows for dynamic lists, while `ForEachState` helps manage the state of iteration over the list.

```c
typedef struct ForEachState
{
	const List *l;				/* list we're looping through */
	int			i;				/* current element index */
} ForEachState;

```

Here is the sample code, we can easy use foreach to iterator `List*` objects.

```c
int main(void) {
    srand( time(NULL) );    
    ListCell   *item;
    List *list = InitialStudents();

    foreach(item, list) {
        Student *stu = lfirst_node(Student, item);
        printf("student name: %s, age: %d\n", stu->name,stu->age);
    }

    // Free allocated memory
    free(list->elements->ptr_value);
    free(list->elements);
    free(list);
    return 0;
}
```
Example code: [foreach loop](https://github.com/isdaniel/BlogSample/tree/master/src/C_Sample/foreach_loop)
